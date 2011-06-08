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
 *
 * - NETWORK JOINED/LEFT EVENT
 *
 * - Events in general
 *
 */

/**
 * global FIXMEs:
 *
 * - calling joinNetwork from the same client twice results in a weird
 *   list structure of DHT[networkPeersKey(network)].
 *   (Update: Verify, removed duplicate entries)
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
		path: '/network/' + networkName,
		method: 'GET',
	};

	route.getDefaultRoute(function(gatewayIP, error) {
		var gatewayAppendix;

		if(error != null) {
			console.log("trackerNetworkRequest: Error while retrieving gateway IP");
			gatewayAppendix = "";
		} else {
			gatewayAppendix = "" // "/" + gatewayIP;  FIXME issue 01
		}

		options.path += gatewayAppendix;

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

function networkKey(networkName) { return makeBuffer(networkName); }
function networkPeersKey(networkName) { return makeBuffer(networkName+"_peers"); }


function makeBuffer(s) { return new Buffer(s.toString()); }


function getModule(Core) {


	// Write data to socket and mark request as answered.
	function answerRequest(socket, data) {
		socket.write(data);
		Core.callRpcMethodLocal("Core.finishRequest", [data.id]);
	}


	var PeerModule = function() {
		// TODO configurable/automatic port

		var peer = this;

		this.port = 8125;

		// TODO better solution for port configuration
		console.log(process.argv)
		if(process.argv.length > 3) {
			this.port = parseInt(process.argv[3]);
			console.log("alternative peer port:",this.port)
		}

		this.node = dht.createNode(this.port).setGlobal();

		console.log('created node:', this.node)

		// Milliseconds the lifetime is valid in the DHT.
		// The peerList should be refreshed by the network root.
		this.peerListLifetime = 20 * 1000;

		// Mapping of networks created by this node.
		// { <name>: {
		// 	  token: <token>,
		// 	  peers: <list of peer ids>,
		// 	  protected: <boolean>,
		//    peerInterval: <peer list refresher interval id>
		//  } }
		this.networks = {};

		// Mapping of networks joined by this node.
		// { <name> : {
		//    rootNode: <rootNodeID>,
		//    peerListCache: <peer list>,
		//    peerInterval: <peer list check interval id>
		// } }
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

			console.log(node.id, 'received', data.toString(), 'from', from);

			// ------------------------------------
			// Route responses to their handlers
			// using the response id.
			// ------------------------------------

			function handleResponse(jsonData) {
				if(peer.pendingRequests[jsonData.id] === undefined) {
					// It's not for us, fire an event
					Core.callRpcMethodLocal("Core.fireEvent", [ "Peers.responseReceived", [from, jsonData] ]);
				} else {
					// It's for us, handle it
					peer.pendingRequests[jsonData.id](jsonData.result, jsonData.error);
				}
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

						peer._addPeerToNetwork(networkName, from);
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
						peer._removePeerFromNetwork(networkName, from);
					}

				// Peer echo, return the strings send
				} else if(jsonData.method === "echo") {
					node.send(from, makeBuffer(
								Core.createJsonRpcResponse(jsonData.id, params.join(' '))));

				// Dispatch to other modules.
				} else {
					Core.callRpcMethodLocal("Core.fireEvent", ["Peers.messageReceived", [from, jsonData]]);
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
		// Unexported helper
		// ------------------------------------

		// Add handler which waits for the given requestId and gets executed.
		// See the node recv handler (handleResponses) for details.
		_addPendingRequest: function(requestId, handler) {
			this.pendingRequests[requestId] = handler;
		},


		// Add peer to network list.
		// This node must be the creator of the network to do this.
		_addPeerToNetwork: function(networkName, peerId) {
			var peer = this;
			var network = peer.networks[networkName];
			var peerListKey = networkPeersKey(networkName);

			console.log('_addPeerToNetwork(',networkName,',',peerId,')');

			peer.node.get(peerListKey, function(ok, buffers) {
				if(!ok) {
					return;
				}

				var peers = [];

				try {
					peers = JSON.parse(buffers[0].toString());
				} catch(e) {
					return;
				}

				// Ignore already registered peer.
				if(peers.indexOf(peerId) >= 0) {
					return;
				}

				// Add peer to peer list and publish the list
				peer._publishPeerList(networkName, peers.concat(peerId));
			});
		},


		// Set DHT[networkPeersKey(networkName)] = JSON(peerList)
		_publishPeerList: function(networkName, peerList) {
			var jsonPeerList = JSON.stringify( peerList );
			console.log("_publishPeerList",networkName,jsonPeerList);
			this.node.put(networkPeersKey(networkName), makeBuffer(jsonPeerList), this.peerListLifetime, true);
		},


		// Remove given peer from DHT[networkPeersKey(networkName)]
		_removePeerFromNetwork: function(networkName, peerId) {
			this.node.get(networkPeersKey(networkName), function(ok, buffers) {
				if(!ok) {
					return;
				}

				var peers = [];
				try {
					peers = JSON.parse(buffers[0].toString());
				} catch(e) {
					return;
				}

				var peerList = peers.filter(function(e) { return e != peerId; });
				this._publishPeerList(networkName, peerList);
			});
		},


		_refreshNetworkInfo: function(peer, networkName) {
			// Refresh the peer list in the DHT.
			// Refresh the network key.
			//
			// This method is called periodically.
			//
			// TODO discuss: usage of locally cached peers?
			//
			// TODO ping clients via echo to see if they're still present

			var network = peer.networks[networkName];

			console.log('refreshing network info for', networkName);

			if(network === undefined) {
				console.log("Peer list refresher: Error while refreshing for",
						networkName, ": network is undefined.");
				return;
			}

			// Register the network in the DHT.
			// The node to speak with for this network is me.
			peer.node.put(networkKey(networkName), makeBuffer(peer.node.id), peer.peerListLifetime / 1000);

			peer.node.get(networkPeersKey(networkName), function(ok, buffers) {
				var peers = [peer.node.id];

				if(ok) {
					try {
						peers = JSON.parse(buffers[0].toString());
					} catch(e) {
						console.log("Peer list refresher:", e, 'data:', data.toString());
					}
				}

				console.log("peer list refresher:",networkName,ok,buffers,peers);

				// Put the peer list as unique value in the DHT
				peer._publishPeerList(networkName, peers);
			});
		},


		// Check the peer list periodically. If it is not existant, it means the
		// root node is unreachable. Try to overtake the network.
		_checkPeerList: function(peer, networkName) {

			peer.node.get(networkPeersKey(networkName), function(ok, buffers) {
				if(!ok) {
					// TODO overtake network
				} else {
					// Cache peer list

					var peerList = [];

					try {
						peerList = JSON.parse(buffers[0].toString());
					} catch(e) {
						// TODO overtake network
					}

					if(peerList.length == 0) {
						// TODO overtake network
					}

					this.joinedNetworks[networkName]['peerListCache'] = peerList;
				}
			});
		},


		// Add created network to local network cache.
		// TODO write the token in some file to restore it after client restart.
		_addNetwork: function(name, token, protected) {
			// Add peer list refreshing service
			var intervalId = setInterval(this._refreshNetworkInfo, this.peerListLifetime * 0.8, this, name);

			// Register locally
			this.networks[name] = {
				token: token,
				protected: false,
				peerInterval: intervalId
			};

			// Call initially
			this._refreshNetworkInfo(this, name);
		},


		// Add joined network to local network cache.
		// Start watching the network for missing peer list.
		_addJoinedNetwork: function(rootPeer, networkName) {
			var intervalId = setInterval(this._checkPeerList, this.peerListLifetime, this, networkName);

			Core.callRpcMethodLocal("Core.fireEvent", ["Peers.joinedNetwork", [networkName]])

			// mark as joined
			this.joinedNetworks[networkName] = {
				rootNode: rootPeer.dht_id,
				peerInterval: intervalId
			};
		},


		// Remove joined network from local joined networks cache.
		// Stop watching the network.
		_leaveNetwork: function(networkName) {
			if(this.joinedNetworks[networkName] === undefined) {
				return;
			}

			var network = this.joinedNetworks[networkName];

			Core.callRpcMethodLocal("Core.fireEvent", ["Peers.leftNetwork", [networkName]])

			delete this.joinedNetworks[networkName];

			clearInterval(network.peerInterval);
		},


		// Remove created network from local created networks cache.
		// Stop emitting the peer list.
		_deleteNetwork: function(name) {
			// Stop peer refreshing service.
		   	var network = this.networks[name];

			if(network === undefined) {
				return;
			}

			clearInterval(network.peerInterval);
		},



		// ------------------------------------
		// Exported methods follow
		// ------------------------------------


		// ------------------------------------
		// Tracker only interaction
		// ------------------------------------

		// Creates a new network on the tracker and in the DHT under the given name.
		createNetwork: function(name) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			trackerNetworkCreate(name, peer.port, peer.node.id, function(token, error) {
				if(error === null) {
					peer._addNetwork(name, token, false);

					answerRequest(socket, Core.createJsonRpcResponse(moduleRequestId, token));
					console.log('added network',name,'token',token);
				} else {
					answerRequest(socket, Core.createJsonRpcError(moduleRequestId, error, Core.json_errors.internal_error));
					console.log('error while creating network', name, error);
				}
			});
		},

		// Same as createNetwork except that this network will be password protected.
		createProtectedNetwork: function(name, password) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			trackerNetworkCreate(name, peer.port, peer.node.id, function(token, error) {
				if(error === null) {
					peer._addNetwork(name, token, true);

					answerRequest(socket, Core.createJsonRpcResponse(moduleRequestId, token));
					console.log('added protected network',name);
				} else {
					answerRequest(socket, Core.createJsonRpcError(moduleRequestId, error, Core.json_errors.internal_error));
					console.log('error while creating protected network', name, error);
				}
			});
		},

		// List of the available networks.
		// TODO:  lookup for networks in the DHT and join them with the
		// TODO:: list of networks in the tracker
		listNetworks: function() {
			var socket = this.socket;
			var requestId = this.requestId;

			trackerNetworkList(function(list, error) {
				if(error === null) {
					answerRequest(socket, Core.createJsonRpcResponse(requestId, list));
					console.log('network list', list);
				} else {
					answerRequest(socket, Core.createJsonRpcError(requestId, error, Core.json_errors.internal_error));
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

			// TODO ask the DHT for the network in case we're already connected

			// Get network from tracker.
			trackerNetworkRequest(networkName, function(rootPeer, error) {
				if(error != null) {
					answerRequest(socket, Core.createJsonRpcError(moduleReqId,
							'Error in getting network from tracker: ' + error,
							Core.json_errors.internal_error));
					return;
				}

				console.log(rootPeer);

				// Join a node from the network, send join request to the node.
				peer.node.join(rootPeer.ip, rootPeer.port, function(success, peers) {
					console.log("joining network",networkName,'peer',rootPeer,'success',success);

					if(!success) {
						answerRequest(socket, Core.createJsonRpcError(moduleReqId,
							'Error in joining network ' + networkName + ': DHT join failed',
							Core.json_errors.internal_error));
						console.log("Join: NO SUCCESS!", networkName, 'peer', rootPeer, success);
						return;
					}

					var requestId = Core.generateRequestId();
					var request = Core.createJsonRpcRequest('join', [networkName], requestId);

					// FIXME:  experimental. It's not guaranteed that the first peer is the
					// FIXME:: network owner. This should be verified.
					rootPeer.dht_id = peers[0];

					// Register handler for join request response.
					peer._addPendingRequest(requestId, function(response, error) {
						console.log(response);
						if(error == null && response === true) {
							peer._addJoinedNetwork(rootPeer, networkName);

							answerRequest(socket, Core.createJsonRpcResponse(moduleReqId, true));

							console.log('joined network', networkName);
						} else {
							answerRequest(socket, Core.createJsonRpcError(moduleReqId, error,
									Core.json_errors.internal_error));

							console.log('error while joining network', networkName);
						}
					});

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
				return answerRequest(socket, Core.createJsonRpcError(moduleRequestId,
							"Unknown network: "+name, Core.json_errors.internal_error));
			}

			var requestId = Core.generateRequestId();

			peer.pendingRequests[requestId] = function(result, error) {
				if(error == null) {
					peer._leaveNetwork(name);

					answerRequest(socket, Core.createJsonRpcResponse(moduleRequestId, true));
					console.log("Successfully left network", name);
				} else {
					answerRequest(socket, Core.createJsonRpcError(moduleRequestId, error, Core.json_errors.internal_error));
					console.log("Error while leaving network:", error);
				}
			};

			peer.node.send(network.rootNode, Core.createJsonRpcRequest("leave", [name], requestId));
		},


		// Store a key with data in the DHT
		DHTput: function(key, data, ttl) {
			var peer = this.module.obj;

			// TODO: check if it's already a buffer

			peer.node.put(makeBuffer(key), makeBuffer(data), ttl);

			answerRequest(this.socket, createJsonRpcResponse(this.requestId, true));
		},


		// Retrieve a key from the DHT.
		// Retrieved values are converted to string to be compatible with JSON RPC.
		DHTget: function(key) {
			var peer = this.module.obj;
			var moduleRequestId = this.requestId;
			var socket = this.socket;

			peer.node.get(makeBuffer(key), function(ok, results) {
				for(var i=0; i < results.length; i++) {
					results[i] = results[i].toString();
				}
				answerRequest(socket, createJsonRpcResponse(moduleRequestId, results));
			});
		},


		// Send a message (string) to a peer.
		sendMessage: function(peerId, message) {
			var peer = this.module.obj;

			peer.node.send(peerId, makeBuffer(message));

			answerRequest(this.socket, Core.createJsonRpcResponse(this.requestId, true));
		},


		// Query the network for all peers in the network.
		listPeers: function(networkName) {
			var peer = this.module.obj;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			peer.node.get(networkPeersKey(networkName), function(ok, buffers) {
				var peers;

				if(ok) {
					try {
						peers = JSON.parse(buffers[0].toString());
					} catch(e) {
						answerRequest(socket, Core.createJsonRpcError(moduleRequestId,
								"listPeers: " + e, Core.json_errors.parse_error));
						return;
					}
				} else {
					peers = [];
				}

				answerRequest(socket, Core.createJsonRpcResponse(moduleRequestId, peers));
			});
		},

		getPeerCapabilities: function(networkName, peerId) {
			// TODO
		},


		// ------------------------------------
		// Local data interaction
		// ------------------------------------

		// Return node ID in the DHT
		getMyId: function() {
			answerRequest(this.socket, Core.createJsonRpcResponse(this.requestId, this.module.obj.node.id));
		},


		// Get a list of joined networks
		getJoinedNetworks: function() {
			var peer = this.module.obj;

			answerRequest(this.socket, Core.createJsonRpcResponse(this.requestId, Object.keys(peer.joinedNetworks)));
		},


	};

	return new PeerModule();
}

module.exports = { getModule: getModule };
