var dht = require('./node-dht/dht.js');
var http = require('http');
var route = require('./route.js');
var querystring = require('querystring');

/**
 * node-dht notes:
 *
 * - node.put() can only take buffers with a 16 bit length
 *   because libcage uses uint16_t as length.
 *
 * - node.put() takes seconds as TTL, not msec.
 *
 * - it seems that libcage/nodejs is VERY time-sensitive.
 *   if a join takes too much time the join fails due to
 *   MISSED packets. This must be fixed _SOON_.
 *   See node-dht/examples/sample3_alt.js and add something
 *   which suspens execution for some time.
 */

/**
 * global TODOs:
 *
 * - save created (and not expired) networks somewhere
 *   so the node can resume it's administrative tasks if it's
 *   restarted. (administrative tasks as in peer list refreshing)
 *
 * - modify generateRequestId() so once can specify the place to
 *   lookup for already assigned IDs.
 */

/**
 * global FIXMEs:
 *
 * - calling joinNetwork from the same client twice results in a weird
 *   list structure of DHT[networkPeersKey(network)].
 */


var cloud7tracker = 'cloud7.heroku.com';

// responseCallback(peer, error)
//   peer: {ip: ..., port: ..., id: ...}
//   error: Exception or null
//
function trackerNetworkRequest(networkName, responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
		// TODO spec says /network/[networkName]/[gatewayIP]
		path: '/network/' + networkName,
		method: 'GET',
	};

	http.get(options, function(res) {
		res.on('data', function(data) {
			var peer;
			try {
				peer = JSON.parse(data);
			} catch(e) {
				return responseCallback(null, e);
			}

			// XXX keep status? not specified!
			if(peer.status !== undefined) {
				responseCallback(null, peer.status);
			} else {
				responseCallback(peer, null);
			}
		});
	});
}

// responseCallback(list, error)
//
function trackerNetworkList(responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
		path: '/networks',
		method: 'GET',
	};
	http.get(options, function(res) {
		res.on('data', function(data) {
			var list;
			try {
				list = JSON.parse(data);
			} catch(e) {
				return responseCallback(null, e);
			}
			responseCallback(list, null);
		});
	});
}


// responseCallback(token, error)
//
// Create network on the tracker and hand the generated admin token to
// the callback as well as an error (null if no error occured).
//
function trackerNetworkCreate(networkName, nodePort, nodeId, responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
	};

	// Register network by passing a POST request to the tracker
	function registerNetwork(localIP, gatewayIP) {
		options['path'] = '/network';
		options['method'] = 'POST';

		var reqData = querystring.stringify({
			name: networkName,
			lan_ip: localIP,
			gateway_ip: gatewayIP,
			port: nodePort,
			dht_id: nodeId
		});

		options['headers'] = {}
		options['headers']['Content-Length'] = reqData.length;

		var req = http.request(options, function(response) {
			response.on('data', function(data) {
				var response;
				try {
					response = JSON.parse(data);
				} catch(e) {
					return responseCallback(null, e);
				}
				if(response.status != undefined) {
					responseCallback(null, response.status);
				} else {
					responseCallback(response.token, null);
				}
			});
		});

		req.write(reqData);
		req.end();
	}

	// Fetch local and gateway IP, pass it to registerNetwork
	function getRegistrationData() {
		options['path'] = '/IP';
		options['method'] = 'GET';

		http.get(options, function(response) {
			var localIP = response.connection.address()['address'];

			route.getDefaultRoute(function(gatewayIP) {
				// TODO check route === null
				registerNetwork(localIP, gatewayIP);
			});
		});
	}

	getRegistrationData();
}

function networkPeersKey(networkName) { return makeBuffer(networkName + "_peers"); }

function makeBuffer(s) { return new Buffer(s.toString()); }


function getModule(Core) {

	var PeerModule = function() {
		// TODO configurable/automatic port

		var peer = this;

		this.port = 8125;
		this.node = dht.createNode(this.port).setGlobal();

		console.log('created node:', this.node)

		// Seconds the lifetime is valid in the DHT.
		// The peerList should be refreshed by the network root.
		this.peerListLifetime = 20;

		// Mapping of networks created by this node.
		// { <name>: {
		// 	  token: <token>,
		// 	  peers: <list of peer ids>,
		// 	  protected: <boolean>,
		//    peerInterval: <peer list refresher interval id>
		//  } }
		this.networks = {};

		// Mapping of networks joined by this node.
		// { <name> : { rootNode: <rootNodeID> } }
		this.joinedNetworks = {};

		// Mapping with allowed RPC request methods and
		// their parameter count
		this.validRequests = {
			join: 1,
			leave: 1
		};

		// Mapping of pending requests from other peers.
		// { <requestId> : <callback> }
		this.pendingRequests = {};

		// Handler for incoming DHT messages.
		this.node.recv(function(data, from) {

			var node = this;

			console.log(node.id, 'received', data, 'from', from);

			// ------------------------------------
			// Route responses to their handlers
			// using the response id.
			// ------------------------------------

			function handleResponse(jsonData) {
				if(peer.pendingRequests[jsonData.id] === undefined) {
					node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
												'Unexpected response: '+id,
												Core.json_errors.invalid_request)));
					console.log('Invalid response',jsonData,'from',from);
					return;
				}

				peer.pendingRequests[jsonData.id](jsonData.result, jsonData.error);
			}

			// ------------------------------------
			// Handle requests from other peers,
			// like join or echo.
			// ------------------------------------


			function handleRequest(jsonData) {
				if(peer.validRequests[jsonData.method] === undefined ||
				   peer.validRequests[jsonData.method] != jsonData.params.length) {
					node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
												'Undefined method or invalid param. count',
												Core.json_errors.invalid_request)));
					console.log('Invalid request',jsonData,'from',from);
					return;
				}

				// Open network join. Everybody may join.
				if(jsonData.method === "join") {
					var networkName = jsonData.params[0];

					if(true || peer.networks[networkName] !== undefined) {
						// FIXME check disabled for testing purposes

						// We own the network, it's ok for him to join us
						node.send(from, makeBuffer(
									Core.createJsonRpcResponse(jsonData.id, true)));

						peer.addPeerToNetwork(networkName, from);
					} else {
						// The peer got the wrong guy, we are not the network owner
						// XXX is this really necessary? Can't everyone accept new peers?
						node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
													'Not my network: '+networkName,
													Core.json_errors.internal_error)));
					}
				// Open network leave.
				} else if(jsonData.method === "leave") {
					var networkName = jsonData.params[0];

					if(peer.networks[networkName] === undefined) {
						node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
											'Not my network: '+networkName,
											Core.json_errors.internal_error)));
					} else {
						node.send(from, makeBuffer(Core.createJsonRpcResponse(jsonData.id, true)));
						peer.removePeerFromNetwork(networkName, from);
					}
				// Peer echo, return the strings send
				} else if(jsonData.method === "echo") {
					node.send(from, makeBuffer(
								Core.createJsonRpcResponse(jsonData.id, params.join(' '))));
				}
			}

			// ------------------------------------
			// Parse the request as JSON.
			// Requests and responses must be
			// formatted as JSON-RPC 2.0.
			// ------------------------------------

			var reqData;

			try {
				jsonData = JSON.parse(data.toString());
			} catch(e) {
				console.log('Could not parse data', data, 'from', from);
				return;
			}

			if(Core.validateJsonRpcResponse(jsonData)) {
				handleResponse(jsonData);
			} else if(Core.validateJsonRpcRequest(jsonData)) {
				handleRequest(jsonData);
			} else {
				console.log('Invalid json-rpc request', jsonData, 'from', from);
			}
		});
	};



	PeerModule.prototype = {

		// ------------------------------------
		// Unexported (TODO) helper
		// Don't call them from the outside!
		// ------------------------------------

		addPeerToNetwork: function(networkName, peerId) {
			var peer = this; // TODO refactor this method (s/peer/this/g)
			var network = peer.networks[networkName];
			var peerListKey = networkPeersKey(networkName);
			var peerListLifetime = peer.peerListLifetime;

			console.log('addPeerToNetwork(',networkName,',',peerId,')');

			peer.node.get(peerListKey, function(ok, buffer) {
				function onNoPeerlist() {
					// No peer list found in the DHT for this network.
					// Publish one if any peers are known.

					// TODO cache peers locally, use them too

					var peerList = JSON.stringify([peer.node.id, peerId]);
					peer.node.put(peerListKey, makeBuffer(peerList), peerListLifetime);
				}

				if(!ok) {
					return onNoPeerlist();
				}

				var peers = [];

				try {
					peers = JSON.parse(buffer.toString());
				} catch(e) {
					return onNoPeerlist();
				}

				// Add peer to peer list and publish the list
				var peerList = JSON.stringify( peers.concat(peerId) );
				peer.node.put(peerListKey, makeBuffer(peerList), peerListLifetime);
			});

			// TODO good idea?
			//network.peers = network.peers.concat(peerId);
		},

		removePeerFromNetwork: function(networkName, peerId) {
			this.node.get(networkPeersKey(networkName), function(ok, data) {
				if(!ok) {
					return;
				}

				var peers = [];
				try {
					peers = JSON.parse(data.toString());
				} catch(e) {
					return;
				}

				var peerList = peers.filter(function(e) { return e != peerId; });
				this.put(networkPeersKey(networkName), makeBuffer(JSON.stringify(peerList)), this.peerListLifetime);
			});
		},


		refreshPeerList: function(peer, networkName) {
			// Refresh the peer list in the DHT.
			// This method is called periodically.
			//
			// TODO discuss: usage of locally cached peers?
			//
			// TODO ping clients via echo to see if they're still present

			var network = peer.networks[networkName];

			console.log('refreshing peer list for', networkName);

			if(network === undefined) {
				console.log("Peer list refresher: Error while refreshing for",
						networkName, ": network is undefined.");
				return;
			}

			peer.node.get(networkPeersKey(networkName), function(ok, data) {
				if(!ok) {
					return;
				}

				var peers = [peer.node.id];

				try {
					peers = JSON.parse(data.toString());
				} catch(e) {
					console.log("Peer list refresher:", e, 'data:', data.toString());
				}

				var peerList = JSON.stringify(peers);
				peer.node.put(networkPeersKey(networkName), makeBuffer(peerList), peer.peerListLifetime);
			});
		},

		addNetwork: function(name, token, protected) {
			// Add peer list refreshing service
			var intervalId = setInterval(this.refreshPeerList, this.peerListLifetime * 800, this, name);

			this.networks[name] = {
				token: token,
				protected: false,
				peerInterval: intervalId
			};
		},

		deleteNetwork: function(name) {
			// Stop peer refreshing service.
		   	var network = this.networks[name];

			if(network === undefined) {
				return;
			}

			clearInterval(network.peerInterval);
		},


		// ------------------------------------
		// Tracker only interaction
		// ------------------------------------

		// TODO discuss: all those methods should work without the tracker if peers are known.
		createNetwork: function(name) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			trackerNetworkCreate(name, peer.port, peer.node.id, function(token, error) {
				if(error === null) {
					peer.addNetwork(name, token, false);

					socket.write(Core.createJsonRpcResponse(moduleRequestId, token));
					console.log('added network',name,'token',token);
				} else {
					socket.write(Core.createJsonRpcError(moduleRequestId, error, Core.json_errors.internal_error));
					console.log('error while creating network', name, error);
				}
			});
		},

		createProtectedNetwork: function(name, password) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			trackerNetworkCreate(name, peer.port, peer.node.id, function(token, error) {
				if(error === null) {
					peer.addNetwork(name, token, true);

					socket.write(Core.createJsonRpcResponse(moduleRequestId, token));
					console.log('added protected network',name);
				} else {
					this.socket.write(Core.createJsonRpcError(this.requestId, error, Core.json_errors.internal_error));
					console.log('error while creating protected network', name, error);
				}
			});
		},

		listNetworks: function() {
			var socket = this.socket;
			var requestId = this.requestId;

			trackerNetworkList(function(list, error) {
				if(error === null) {
					socket.write(Core.createJsonRpcResponse(requestId, list));
					console.log('network list', list);
				} else {
					socket.write(Core.createJsonRpcError(requestId, error, Core.json_errors.internal_error));
					console.log('error while listing networks', error);
				}
			});
		},

		// ------------------------------------
		// Tracker and DHT interaction
		// ------------------------------------

		joinNetwork: function(networkName) {
			var peer = this.module.obj;			// this very module
			var socket = this.socket;			// requesting module's socket
			var moduleReqId = this.requestId;	// requesting module's request id

			// Get network from tracker.
			trackerNetworkRequest(networkName, function(rootPeer, error) {
				if(error != null) {
					socket.write(Core.createJsonRpcError(moduleReqId, 'Error in getting network from tracker: ' + error,
							Core.json_errors.internal_error));
					return;
				}

				console.log(rootPeer);

				// Join a node from the network, send join request to the node.
				peer.node.join(rootPeer.ip, rootPeer.port, function(success, peers) {
					console.log("joining network",networkName,'peer',rootPeer,'success',success);

					if(!success) {
						console.log("Join: NO SUCCESS!", networkName, 'peer', rootPeer, success);
						return;
					}

					var requestId = Core.generateRequestId();
					var request = Core.createJsonRpcRequest('join', [networkName], requestId);

					// FIXME experimental
					rootPeer.dht_id = peers[0];

					// Register handler for join request response.
					peer.pendingRequests[requestId] = function(response, error) {
						console.log(response);
						if(error == null && response === true) {
							peer.joinedNetworks[networkName] = { rootNode: rootPeer.dht_id }; // mark as joined

							socket.write(Core.createJsonRpcResponse(moduleReqId, true));
							console.log('joined network', networkName);
						} else {
							socket.write(Core.createJsonRpcError(moduleReqId, error, Core.json_errors.internal_error));
							console.log('error while joining network', networkName);
						}
					};

					console.log('sending stuff to peer', rootPeer.dht_id, 'data', request);
					peer.node.send(rootPeer.dht_id, makeBuffer(request));
				});
			});
		},

		joinProtectedNetwork: function(name, password) {
			var peer = this.module.obj;

			trackerNetworkRequest(name, function(rootPeer, error) {
				// TODO check error
				peer.node.join(rootPeer.ip, rootPeer.port, function(success) {
					// TODO implement
				});
			});
		},

		// ------------------------------------
		// DHT interaction
		// ------------------------------------

		leaveNetwork: function(name) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			var network = peer.joinedNetworks[name];

			if(network === undefined) {
				return socket.write(Core.createJsonRpcError(moduleRequestId,
							"Unknown network: "+name, Core.json_errors.internal_error));
			}

			var requestId = Core.generateRequestId();

			peer.pendingRequests[requestId] = function(result, error) {
				if(error == null) {
					delete peer.joinedNetworks[name];

					socket.write(Core.createJsonRpcResponse(moduleRequestId, true));
					console.log("Successfully left network", name);
				} else {
					socket.write(Core.createJsonRpcError(moduleRequestId, error, Core.json_errors.internal_error));
					console.log("Error while leaving network:", error);
				}
			};

			peer.node.send(network.rootNode, Core.createJsonRpcRequest("leave", [name], requestId));
		},

		listPeers: function(networkName) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			peer.node.get(networkPeersKey(networkName), function(ok, data) {
				var peers;

				if(ok) {
					try {
						peers = JSON.parse(data.toString());
					} catch(e) {
						socket.write(Core.createJsonRpcError(moduleRequestId,
								"listPeers: " + e, Core.json_errors.parse_error));
						return;
					}
				} else {
					peers = [];
				}

				socket.write(Core.createJsonRpcResponse(moduleRequestId, peers));
			});
		},

		getPeerCapabilities: function(networkName, peerId) {},

	};

	return new PeerModule();
}

module.exports = {getModule: getModule};
