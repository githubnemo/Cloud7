/**
 * Cloud7 core.
 *
 * Route RPC signals, handle modules, handle events.
 */


var registeredModules = {};
var registeredEvents = {};
var eventIdToEvent = [];
var pendingRequests = {};

/*
 * registeredModules:
 * {
 *	moduleName: {
 *		methods: [],
 *		socket: #<socket>
 *		version: ""
 *	},
 *	...
 * }
 *
 * registeredEvents:
 * {
 *	eventIdentifier1: [eventId1, eventId2, ...],
 *	...
 * }
 *
 * eventIdToEvent: {
 * 	id1: [eventIdentifier1,moduleName1,methodName1],
 * 	id2: [eventIdentifier2,moduleName2,methodName2],
 * 	...
 * }
 *
 * eventIdentifier: moduleName.eventName
 * 		example: Core.newModule OR Peers.joinedNetwork
 *
 * 	callbackIdentifier: moduleName.callbackName
 * 		example: GUI.handleJoinedNetwork
 *
 * pendingRequests:
 * {
 *  123456: handler()
 *  ...
 * }
 */

/**
 * Signature: addNewEvent(id, module, method)
 *
 * id: event identifier (String)
 * module: module identifier (String)
 * method: method identifier (String)
 *
 * @return int	Index of the freshly registered event listener
 */
eventIdToEvent.addNewEvent = function(id, module, method) {
	var add = function(idx,id,module,method) {
		eventIdToEvent[idx] = [id, module, method];
		return idx;
	};

	// Find free slot
	for(var i=0; i < eventIdToEvent.length; i++) {
		if(eventIdToEvent[i] === undefined) {
			return add(i, id, module, method);
		}
	}

	// No free slot, append
	return add(eventIdToEvent.length - 1, id, module, method);
}





/**
 * Array utilities.
 */

/**
 * Signature: Array().append(elem)
 *
 * Appends an element to the array.
 */
Array.prototype.append = function(elem) {
	this[this.length] = elem;
	return this;
};

/**
 * Signature: Array().has(needle)
 *
 * Checks if the given element is in the array and
 * returns true if that's the case, otherwise false.
 */
Array.prototype.has = function(needle) {
	return this.indexOf(needle) >= 0;
};

/**
 * Signature: Array.valueOf(object)
 *
 * Converts the given object into an array by
 * copying all indices with their values to the
 * current object.
 *
 * Existing indices may be overriden.
 */
Array.valueOf = function(obj) {
	var newArray = [];
	var x;

	for(x in obj) {
		newArray[x] = obj[x];
	}
	return newArray;
};







/**
 * Signature: Core(init)
 *
 * Provides the main program logic.
 */
function Core(init) {
	init.apply(this);
}

Core.prototype = {

	// {method:"Core.registerModule", params:[{"name":"Test", "methods":["testString","testInt"]}], id:133}

	registerLocalModule: function(name, obj) {
		var methods = this.getMethods(obj);
		registeredModules[name] = new LocalModule(name, methods, obj);
		return true;
	},

	registerRpcModule: function(name, methods, socket) {
		registeredModules[name] = new RpcModule(name, methods, socket);
		return true;
	},

	unregisterModule: function(name) {
		delete registeredModules[name];
	},


	// Return an array of method names of obj which don't start with an underscore (_).
	getMethods: function(obj) {
		var methods = [];
		var attr;

		for(attr in obj) {
			if(attr[0] !== "_" && typeof obj[attr] === "function") {
				methods.append(attr);
			}
		}

		return methods;
	},


	/**
	 * Signature: callRpcMethod(socket, method, params, responseHandler)
	 *
	 * responseHandler signature: func(response, error)
	 *
	 * The response handler's argument response can be undefined if an
	 * error occured. In this case, error is !== undefined. If no error
	 * occured, error is undefined.
	 */
	callRpcMethod: function(socket, method, params, responseHandler) {
		var id = this.generateRequestId();

		pendingRequests[id] = responseHandler;

		socket.write(this.createJsonRpcRequest(method, params, id));

		return id;
	},

	generateRequestId: function () {
		for(;;) {
			var id = Math.floor(Math.random()*Math.pow(2,32));
			if(pendingRequests[id]) {
				continue;
			}
			return id;
		}
	},

	/*
	 * JSON definitions / methods
	 */

	json_errors: {
		parse_error: 		-32700, 	// Parse error 			Invalid JSON was received by the server.
		invalid_request: 	-32600, 	// Invalid Request 		The JSON sent is not a valid Request object.
		method_not_found: 	-32601, 	// Method not found 	The method does not exist / is not available.
		invalid_params: 	-32602, 	// Invalid params 		Invalid method parameter(s).
		internal_error: 	-32603  	// Internal error 		Internal JSON-RPC error.
	},

	// JSON RPC helper
	// TODO move those helpers into a json-rpc module
	createJsonRpcResponse: function (id, result) {
		var response = {
			jsonrpc: "2.0",
			result: result,
			id: id
		};
		return JSON.stringify(response) + "\r\n";
	},

	createJsonRpcError: function (id, msg, errorCode) {
		var error = {
			jsonrpc: "2.0",
			id: id,
			error: {
				code: errorCode,
				message: msg
			}
		};
		return JSON.stringify(error) + "\r\n";
	},

	createJsonRpcRequest: function (method, params, id) {
		if(id === undefined) {
			// Create request ID
			id = this.generateRequestId();
		}

		var request = {
			jsonrpc: "2.0",
			method: method,
			id: id,
			params: params
		};
		return JSON.stringify(request) + "\r\n";
	},

};


/**
 * Local module: "Core"
 *
 * The core module contains all management methods suitable
 * to be exported via RPC.
 */
var CoreModule = {
	echo: function(echoThis) {
		console.log("magie:", echoThis, this.requestId);
		this.socket.write(this.core.createJsonRpcResponse(this.requestId, echoThis));
	},

	registerModule: function(name, methods) {
		var success = this.core.registerRpcModule(name, methods, this.socket);
		this.socket.write(this.core.createJsonRpcResponse(this.requestId, success));
	},

	/*
	 * Signature: fireEvent(name, data) => Boolean
	 *
	 * name: String
	 * data: Array
	 *
	 * How it works:
	 *
	 * Peers: {"method":"Core.fireEvent", "params":["Peers.joinedNetwork", ["HAW"]], id:123}
	 * Core: {"result":true, "id":123}
	 *
	 * To everyone who's registered to "Peers.joinedNetwork" (GUI and Test for example):
	 * Core: {"method":"Peers.joinedNetwork", "params":["HAW"], "id":id}
	 * GUI: {"result":true, "id":id}
	 *
	 * Core: {"method":"Peers.joinedNetwork", "params":["HAW"], "id":id+1}
	 * Test: {"result":true, "id":id+1}
	 */
	fireEvent: function(name, data) {
		var listeners = registeredEvents[name];

		for(var i=0; i < listeners.length; i++) {
			var row = eventIdToEvent[listeners[i]];

			var module = registeredModules[row[1]]
			var method = module.getMethod(row[2])

			if(typeof method !== 'function') {
				console.log("Can't fire event "+name+" to "+module+": No method.");
				return;
			}

			method.apply({socket: this.socket, requestId: this.generateRequestId(), core: this.core}, data);
		}
	},

	/*
	 * Signature: bindToEvent(identifier, callbackIdentifier) => Int
	 *
	 * identifier: String
	 * callbackIdentifier: String
	 *
	 * Error response if the module in the callbackIdentifier is not loaded
	 * or the callbackIdentifier is ill-formed.
	 */
	bindToEvent: function(identifier, callbackIdentifier) {
		var composite = callbackIdentifier.split('.');

		if( composite.length != 2 ) {
			this.socket.write(this.core.createJsonRpcError(
				this.requestId,
				"Ill-formed callback identifier: "+callbackIdentifier+".",
				this.json_errors.internal_error));
			return;
		}

		var module = composite[0];
		var method = composite[1];

		if( !registeredModules[module] ) {
			this.socket.write(this.core.createJsonRpcError(
				this.requestId,
				"Receiving module "+module+" is not registered.",
				this.json_errors.internal_error));
			return;
		}

		var eventId = eventIdToEvent.addNewEvent(identifier, module, method);

		// Save the events by identifier for easy lookup
		if( registeredEvents[identifier] === undefined) {
			registeredEvents[identifier] = Array();
		}

		registeredEvents[identifier].append(eventId);

		this.socket.write(this.core.createJsonRpcResponse(this.requestId, eventId));
	},

	unbindFromEvent: function(eventId) {

		// TODO check calling module (it shall own the event to unbind it)

		delete eventIdToEvent[eventId];

		// TODO return value
	}


};


/**
 * Signature: Module(name, [methods])
 *
 * The Module function represents
 * a) the base type of all modules
 * b) a gateway for retrieving modules
 *
 * You can retrieve a registered module by calling
 *
 *	Module(name)
 *
 * For example:
 *
 *	Module("Peers")
 *
 * If the module is not found, null is returned.
 *
 * New modules can be created by using more than one
 * parameter. For example a LocalModule:
 *
 *	new LocalModule("Core", ["registerModule"], CoreModule);
 *
 */
var Module = function(name, methods) {
	if(arguments.length == 1) {
		// Find an existing module if only name is given

		var moduleData = registeredModules[name];

		if(moduleData === undefined) {
			return null;
		}

		return moduleData;
	}

	this.name = name;
	this.methods = methods;
};

Module.prototype = {
	getMethod: function(name) { throw new Execption("getMethod on raw module."); }
};


/**
 * Signature: LocalModule(name, methods, obj)
 *
 * Local modules are modules which are installed in the core and not
 * connected directly via RPC.
 *
 * How to register a local module: core.registerLocalModule("Core", CoreModule);
 */
var LocalModule = function(name, methods, obj) {
	Module.apply(this, [name, methods]);
	this.obj = obj;
};

LocalModule.prototype = {
	getMethod: function(name) {
		if(this.methods.has(name)) {
			// TODO check for evilness
			return eval("this.obj."+name);
		}
		return null;
	}
};


/**
 * Signature: RpcModule(name, methods, socket)
 *
 * RPC Modules are modules which are connected over RPC and placed
 * somewhere on the system, written in some language.
 *
 * How to register a rpc module: core.registerRpcModule("Peers", methods, socket);
 */
var RpcModule = function(name, methods, socket) {
	Module.apply(this, [name, methods]);
	this.socket = socket;
}

RpcModule.prototype = {

	/**
	 * Signature: getMethod(name)
	 *
	 * Builds a proxy method which makes an RPC call to the requested method.
	 * The result is written back to the requesting socket.
	 *
	 * Example:
	 * IN: {"method":"Peers.get","id":123,"params":[]}
	 *	Peers is retrieved and Module("Peers").getMethod("get") (this method)
	 *	is called. We call "get" on "Peers".
	 * OUT: {"method":"Peers.get","id":3494277933,"params":[]}
	 *	Peers processes our request and sends a response.
	 * IN: {"result":"getet","error":null,"id":3494277933}
	 *	We can now notify the sender of the inital request that a result
	 *	returned.
	 * OUT: {"result":"getet","id":123,"error":null}
	 *
	 * @return function 	Proxy method for handling the request.
	 */
	getMethod: function(name) {
		if(this.methods.has(name)) {
			var module = this;
			return function() {
				// Proxy method
				console.log("Proxycall to",name);

				var moduleName = module.name;
				var requestId = this.requestId;
				var requestSocket = this.socket;
				var core = this.core;

				this.core.callRpcMethod(module.socket, moduleName+"."+name, Array.valueOf(arguments), function(response, error) {
					console.log("Response received: ", response, "Error:", error);

					if(typeof error !== "undefined") {
						requestSocket.write(core.createJsonRpcError(requestId, error, core.json_errors.internal_error));
					} else {
						requestSocket.write(core.createJsonRpcResponse(requestId, response));
					}
				});
			};
		}
		return null;
	}
}



/**
 * Signature: Dispatcher(message, socket, core)
 *
 * The dispatcher checks if the given message is a valid
 * JSON request or response and handles it.
 *
 * Requests:
 *	Requests are parsed, the corresponding module is
 *	received and the method on the module is called.
 *	Passed informations to the called method are:
 *	- this.requestId
 *	- this.socket
 *	- this.core
 *	The called function receives the parameters passed
 *	by the request.
 *
 * Responses:
 *	A matching handler for the response id is found.
 *	The handler is called with the following
 *	informations passed:
 *	- this.responseId
 *	- this.socket
 *	- this.core
 *	The called function receives one parameter:
 *	- The repsonse result
 */
var Dispatcher = function(message, socket, core) {

	this.core = core;

	this.socket = socket;


	if(this.validateRequest(message)) {
		this.routeRequest(message);
	} else if(this.validateResponse(message)) {
		this.routeResponse(message);
	} else {
		console.log("Invalid JSON-RPC 2.0 Data:", message);
		return false;
	}

};

Dispatcher.prototype = {


	validateRequest: function(req) {
		return typeof req.method !== 'undefined' &&
				typeof req.params !== 'undefined' &&
				typeof req.id !== 'undefined';
	},


	validateResponse: function(resp) {
		return (typeof resp.result !== 'undefined' ||
				typeof resp.error !== 'undefined') &&
				typeof resp.id !== 'undefined' &&
				typeof resp.jsonrpc !== 'undefined';
	},



	routeRequest: function(request) {

		var match = request.method.match(/^(.+)\.(.+)/);

		if(match === null) {
			console.log("Ill-formed request:",request);
			this.socket.write(this.core.createJsonRpcError(
				request.id, "Ill-formed request.", this.core.json_errors.internal_error));
			return;
		}

		var moduleName = match[1];
		var methodName = match[2];

		var module = Module(moduleName);

		if(module === null) {
			console.log("Unknown module in RPC request.");
			this.socket.write(this.core.createJsonRpcError(
				request.id, "Unknown module "+moduleName, this.core.json_errors.method_not_found));
			return;
		}

		var method = module.getMethod(methodName);

		if(typeof method !== 'function') {
			console.log("Unknown method in RPC request:",methodName);
			this.socket.write(this.core.createJsonRpcError(
				request.id, "Unknown method "+methodName, this.core.json_errors.method_not_found));
			return;
		}

		method.apply({socket: this.socket, requestId: request.id, core: this.core}, request.params);
	},

	routeResponse: function(response) {
		var handler = pendingRequests[response.id];

		if(handler === undefined) {
			console.log("No handler for response",response.id);
			return;
		}

		handler.apply({socket: this.socket, responseId: response.id, core: this.core}, [ response.result, response.error ]);
	}

};


/**
 * Main function.
 *
 * Register essential local modules and setup the RPC server.
 */
var core = new Core(function() {

	var net = require('net');

	this.registerLocalModule("Core", CoreModule);

	var core = this;

	// Setup RPC server
	this.server = net.createServer(function (socket) {

		socket.on('data', function(data) {

			// Overwrite write for debugging/logging purposes.
			socket.write = function(that, write) {
				return function() {
					var args = Array.valueOf(arguments);
					args[args.length] = function() { console.log("OUT:",args); };
					write.apply(that, args);
				}
			}(socket, socket.write);

			console.log("IN:",data.toString());

			var message = null;
			try {
				message = JSON.parse(data);
			} catch(e) {
				console.log("Could not parse incoming JSON data:",data.toString(),"Reason:", e);
				socket.write(core.createJsonRpcError(null, "Ill-formed request.", core.json_errors.parse_error));
				return
			}

			if(message !== null) {
				new Dispatcher(message, socket, core);
			}

		});

	}).listen(8124);

})

