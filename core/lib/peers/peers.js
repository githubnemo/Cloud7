var dht = require('./node-dht/dht.js');


function getModule(LocalModule) {

	var PeerModule = function(name, methods, obj) {
		LocalModule.apply(this, [name, methods, obj]);
	};

	PeerModule.prototype = {};

	return PeerModule;
}

module.exports = {getModule: getModule};
