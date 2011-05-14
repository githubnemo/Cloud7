var dht = require('./node-dht/dht.js');
var http = require('http');
var route = require('./route.js');

var cloud7tracker = 'cloud7.heroku.com';

// responseCallback(peer, error)
//   peer: {ip: ..., port: ...}
//   error: Exception or null
//
function trackerNetworkRequest(networkName, responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
		path: '/networks/' + networkName,
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
			responseCallback(peer, null);
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
// Create network (protected if password != null) on the tracker
// and hand the generated admin token to the callback as well
// as an error (null if no error occured).
//
function trackerNetworkCreate(networkName, password, responseCallback) {
	var options = {
		host: cloud7tracker,
		port: 80,
	};

	function registerNetwork(localIP, globalIP) {
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

		// TODO send data to tracker via POST

		req.end();
	}

	function getRegistrationData() {
		options['path'] = '/IP';
		options['method'] = 'GET';

		http.get(options, function(response) {
			var localIP = response.connection.address();

			response.on('data', function(data) {
				var globalIP;
				try {
					globalIP = JSON.parse(data.toString())['ip'];
				} catch(e) {
					return responseCallback(null, e);
				}

				if(globalIP == localIP) {
					// Use the default gateway as network identifer
					route.getDefaultRoute(function(route) {
						registerNetwork(localIP, route);
					});
				} else {
					// Use global IP as network identifier
					registerNetwork(localIP, globalIP);
				}
			});
		});
	}

	getRegistrationData();
}


function getModule(LocalModule) {

	var PeerModule = function(name, methods, obj) {
		LocalModule.apply(this, [name, methods, obj]);

		// TODO configurable/automatic port

		this.node = dht.createNode(8125).setGlobal();
	};

	PeerModule.prototype = {
		// Tracker only interaction
		// TODO discuss: all those methods should work without the tracker if peers are known.
		createNetwork: function(name) {
			trackerNetworkCreate(name, null, function(token, error) {
				// TODO
			});
		},

		createProtectedNetwork: function(name, password) {
			trackerNetworkCreate(name, password, function(token, error) {
				// TODO
			});
		},

		listNetworks: function() {
			trackerNetworkList(function(list, error) {
				// TODO
			});
		},

		// Tracker and DHT interaction
		joinNetwork: function(name) {
			trackerNetworkRequest(name, function(peer, error) {
				// TODO check error
				this.node.join(peer['ip'], peer['port'], function(success) {
					// TODO
				});
			});
		},

		joinProtectedNetwork: function(name, password) {
			trackerNetworkRequest(name, function(peer, error) {
				// TODO check error
				this.node.join(peer['ip'], peer['port'], function(success) {
					// TODO
				});
			});
		},

		// DHT interaction
		leaveNetwork: function(name) {},
		listPeers: function(networkName) {},
		getPeerCapabilities: function(networkName, peerId) {},

	};

	return PeerModule;
}

module.exports = {getModule: getModule};
