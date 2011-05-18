var dht = require('./node-dht/dht.js');
var http = require('http');
var route = require('./route.js');
var querystring = require('querystring');

/**
 * node-dht notes:
 *
 * - node.put() can only take buffers with a 16 bit length
 *   because libcage uses uint16_t as length.
 * - node.put() takes seconds as TTL, not msec.
 *
 */


var cloud7tracker = 'cloud7.heroku.com';

// responseCallback(peer, error)
//   peer: {ip: ..., port: ...}
//   error: Exception or null
//
function trackerNetworkRequest(networkName, responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
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
function trackerNetworkCreate(networkName, nodePort, responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
	};

	// Register network by passing a POST request to the tracker
	function registerNetwork(localIP, gatewayIP) {
		options['path'] = '/network/' + networkName;
		options['method'] = 'POST';

		var req = http.request(options, function(response) {
			response.on('data', function(data) {
				var networkToken;
				try {
					networkToken = JSON.parse(data)['token'];
				} catch(e) {
					return responseCallback(null, e);
				}
				responseCallback(networkToken, null);
			});
		});

		req.write(querystring.stringify({
			networkName: networkName,
			lanIP: localIP,
			gatewayIP: gatewayIP,
			port: nodePort
		}));

		req.end();
	}

	// Fetch local and gateway IP, pass it to registerNetwork
	function getRegistrationData() {
		options['path'] = '/IP';
		options['method'] = 'GET';

		http.get(options, function(response) {
			var localIP = response.connection.address();

			route.getDefaultRoute(function(gatewayIP) {
				// TODO check route === null
				registerNetwork(localIP, gatewayIP);
			});
		});
	}

	getRegistrationData();
}

function makeBuffer(s) { return new Buffer(s.toString()); }


function getModule(Core) {

	var PeerModule = function() {
		// TODO configurable/automatic port

		var peer = this;

		this.port = 8125;
		this.node = dht.createNode(this.port).setGlobal();

		// Mapping of networks created by this node.
		// { <name>: { token: <token>, peers: <list of peer ids>, protected: <boolean> } }
		this.networks = {};

		// Mapping of networks joined by this node.
		// { <name> : { rootNode: <rootNodeID> } }
		this.joinedNetworks = {};

		// Mapping with allowed RPC request methods and
		// their parameter count
		this.validRequests = {
			join: 2
		};

		// Mapping of pending requests from other peers.
		// { <requestId> : <callback> }
		this.pendingRequests = {};

		// Handler for incoming DHT messages.
		this.node.recv(function(data, from) {

			var node = this;

			// ------------------------------------
			// Route responses to their handlers
			// using the response id.
			// ------------------------------------

			function handleResponse(jsonData) {
				if(pendingRequests[jsonData.id] === undefined) {
					node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
												'Unexpected response: '+id,
												Core.json_errors.invalid_request)));
					console.log('Invalid response',jsonData,'from',from);
					return;
				}

				pendingRequests[jsonData.id](jsonData.result, jsonData.error);
			}

			// ------------------------------------
			// Handle requests from other peers,
			// like join or echo.
			// ------------------------------------

			function addPeerToNetwork(networkName, peerId) {
				var network = peer.networks[networkName];

				if(network.peers.indexOf(peerId) >= 0) {
					return;
				}

				network.peers = network.peers.concat(peerId);
			}

			function handleRequest(jsonData) {
				if(validRequests[jsonData.method] === undefined ||
				   validRequests[jsonData.method] != jsonData.params.length) {
					node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
												'Undefined method or invalid param. count',
												Core.json_errors.invalid_request)));
					console.log('Invalid request',jsonData,'from',from);
					return;
				}

				// Open network join. Everybody may join.
				if(jsonData.method === "join") {
					var networkName = jsonData.params[1];
					if(networks[networkName] !== undefined) {
						// We own the network, it's ok for him to join us
						node.send(from, Core.createJsonRpcResponse(jsonData.id, 'ok'));

						addPeerToNetwork(networkName, from);
					} else {
						// The peer got the wrong guy, we are not the network owner
						// XXX is this really necessary? Can't everyone accept new peers?
						node.send(from, makeBuffer(Core.createJsonRpcError(jsonData.id,
													'Not my network: '+networkName,
													Core.json_errors.internal_error)));
					}
				// Peer echo, return the strings send
				} else if(jsonData.method === "echo") {
					node.send(from, Core.createJsonRpcResponse(jsonData.id, params.join(' ')));
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

			if(Core.validJsonRpcResponse(jsonData)) {
				handleResponse(jsonData);
			} else if(Core.validJsonRpcRequest(jsonData)) {
				handleRequest(jsonData);
			} else {
				console.log('Invalid json-rpc request', jsonData, 'from', from);
			}
		});
	};

	PeerModule.prototype = {
		// ------------------------------------
		// Tracker only interaction
		// ------------------------------------

		// TODO discuss: all those methods should work without the tracker if peers are known.
		createNetwork: function(name) {
			trackerNetworkCreate(name, peer.port, function(token, error) {
				if(error !== null) {
					this.networks[name] = token; // FIXME new structure!
					this.socket.write(Core.createJsonRpcResponse(this.requestId, token));
					console.log('added network',name);
				} else {
					this.socket.write(Core.createJsonRpcError(this.requestId, error, Core.json_errors.internal_error));
					console.log('error while creating network', name, error);
				}
			});
		},

		createProtectedNetwork: function(name, password) {
			var peer = this.module;
			var socket = this.socket;
			var moduleRequestId = this.requestId;

			trackerNetworkCreate(name, peer.port, function(token, error) {
				if(error !== null) {
					peer.networks[name] = { token: token, protected: false };
					socket.write(Core.createJsonRpcResponse(moduleRequestId, token));
					console.log('added network',name);
				} else {
					this.socket.write(Core.createJsonRpcError(this.requestId, error, Core.json_errors.internal_error));
					console.log('error while creating network', name, error);
				}
			});
		},

		listNetworks: function() {
			var socket = this.socket;
			var requestId = this.requestId;

			trackerNetworkList(function(list, error) {
				if(error !== null) {
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
			var peer = this.module;				// this very module
			var socket = this.socket;			// requesting module's socket
			var moduleReqId = this.requestId;	// requesting module's request id

			// Get network from tracker.
			trackerNetworkRequest(networkName, function(rootPeer, error) {
				if(error !== undefined) {
					socket.write(Core.createJsonRpcError(moduleReqId, 'Error in getting network from tracker: ' + error,
							Core.json_errors.internal_error));
					return;
				}

				// Join a node from the network, send join request to the node.
				peer.node.join(rootPeer.ip, rootPeer.port, function(success) {
					var requestId = Core.generateRequestId();
					var request = Core.createJsonRpcRequest('join', [networkName], requestId);

					// Register handler for join request response.
					node.pendingRequests[requestId] = function(response, error) {
						if(error == null && response === 'ok') {
							node.joinedNetworks[networkName] = { rootNode: rootPeer.id }; // mark as joined
							socket.write(Core.createJsonRpcResponse(moduleReqId, true));
						} else {
							socket.write(Core.createJsonRpcError(moduleReqId, error, Core.json_errors.internal_error));
						}
					};

					this.send(rootPeer.id, makeBuffer(request));
				});
			});
		},

		joinProtectedNetwork: function(name, password) {
			trackerNetworkRequest(name, function(rootPeer, error) {
				// TODO check error
				this.node.join(rootPeer.ip, rootPeer.port, function(success) {
					// TODO implement
				});
			});
		},

		// ------------------------------------
		// DHT interaction
		// ------------------------------------

		leaveNetwork: function(name) {},
		listPeers: function(networkName) {},
		getPeerCapabilities: function(networkName, peerId) {},

	};

	return new PeerModule();
}

module.exports = {getModule: getModule};
