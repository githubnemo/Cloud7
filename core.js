var registeredModules = {};
var registeredEvents = {};

var net = require('net');

/**
 * This object is the container for all our core methods which can be accessed through
 * the JSON RPC interface.
 */
var Core = {
	echo: function(echoThis) {
		console.log("magie:", echoThis, this.requestId);
		this.socket.write("magie:" + echoThis + " " + this.requestId);
	} 
};


/** 
 * Der Dispatcher dient dazu, den JSON RPC 1.0 Request auf gültigkeit zu prüfen, und
 * dann zur entsprechenden Methode die diesen bearbeitet weiterzuleiten.
 */
var Dispatcher = function(request, socket) {
	if(!this.validateRequest(request)) {
		console.log("Invalid JSON RPC 1.0 Request.");
		return false;
	}
	
	this.socket = socket;
	
	this.routeRequest(request);
};

Dispatcher.prototype = {
	
	validateRequest: function(req) {
		return typeof req.method !== 'undefined' &&
			   typeof req.params !== 'undefined' &&
			   typeof req.id !== 'undefined';
	},
	
	routeRequest: function(request) {
		var method = eval('Core.' + request.method);
		if(typeof method !== 'function') {
			console.log("Unknown method in RPC request.");
		}
		
		method.apply({socket: this.socket, requestId: request.id}, request.params);
	}
	
};

var server = net.createServer(function (socket) {
	
	socket.on('data', function(data) {
		var request = null;
		try {
			var request = JSON.parse(data);
		} catch(e) {
			console.log("Could not parse incoming JSON data.", e);
		}
		
		if(request !== null) {
			new Dispatcher(request, socket);
		}
		
	});
	
}).listen(8124);