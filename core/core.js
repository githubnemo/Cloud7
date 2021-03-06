/**
 * Cloud7 core.
 *
 * Route RPC signals, handle modules, handle events.
 */

var corePort = 8124;

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
 * id:		event identifier (String)
 * module:	module identifier (String)
 * method:	method identifier (String)
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
	return add(eventIdToEvent.length, id, module, method);
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
 *
 * Also provides access to events / modules for local modules:
 * - registerLocalModule
 * - unregisterModule
 * - getModule
 * - bindToEvent
 * - callRemoteMethod
 *
 */
function Core(init) {
	init.apply(this);
}

Core.prototype = {

	// createError(id, message[, map]) => Array
	//
	// Returns an array which fits the signature of the
	// Core.error event.
	createError: function(id, message) {
		var error = [id, {message: message}];
		if(arguments[2] != undefined) {
			for(var prop in arguments[2]) {
				error[1][prop] = arguments[2][prop];
			}
		}
		return error;
	},

	// {method:"Core.registerModule", params:[{"name":"Test", "methods":["testString","testInt"]}], id:133}

	registerLocalModule: function(name, obj) {
		var methods = this.getMethods(obj);
		registeredModules[name] = new LocalModule(name, methods, obj);
		return true;
	},

	registerRpcModule: function(name, methods, socket) {
		if(registeredModules[name]) {
			return false;
		}
		var token = String(Math.floor(Math.random()*10000));

		registeredModules[name] = new RpcModule(name, methods, socket, token);

		return token;
	},

	unregisterModule: function(name) {
		delete registeredModules[name];
		return true;
	},

	getModule: function(name) {
		return registeredModules[name];
	},

	/**
	 * Signature: callRpcMethodLocal(identifier, params, resultCallback)
	 *
	 * resultCallback signature: resultCallback(data)
	 * 	'data' is tried to be parsed as JSON. If it fails, the data is
	 * 	wrapped in an JSON RPC error response instead.
	 *
	 * Local modules provide methods which are designed to communicate over
	 * RPC. Local modules don't do that but they should be able to use the
	 * API. This method enables that.
	 *
	 * Note that by using a fake socket, strange behaviour may occur.
	 * For example if you're using Core.registerModule: The module socket
	 * will be that very fake socket and all answers of a event call will
	 * be written to the module socket.
	 *
	 * Example:
	 *
	 * 	// from a local module
	 * 	Core.callRpcMethodLocal("Peers.sendMessage", ["a93c19a9d11c38", "OHAI"], <function#123>);
	 *
	 */
	callRpcMethodLocal: function(identifier, params, resultCallback) {
		var id = this.generateRequestId();
		var self = this;

		var fakeSocket = {
			write: function(data) {
				if(resultCallback === undefined) {
					return;
				}

				var parsed = null;

				try {
					parsed = JSON.parse(data);
				} catch(e) {
					resultCallback(self.createJsonRpcError(id, [e,data], self.json_errors.parse_error));
					return;
				}

				resultCallback(parsed);
			}
		};

		new Dispatcher(JSON.parse(this.createJsonRpcRequest(identifier, params, id)), fakeSocket, this);
	},

	/**
	 * Signature: bindToEvent(identifier, module, method) => Number
	 *
	 * Logic of CoreModule#bindToEvent.
	 *
	 * Returns the ID of the created event handler.
	 *
	 * Example:
	 * 	bindToEvent("Peers.messageReceived", "FileTransfer", "peerMessageReceived")
	 */
	bindToEvent: function(identifier, module, method) {
		var eventId = eventIdToEvent.addNewEvent(identifier, module, method);

		// Save the events by identifier for easy lookup
		if( registeredEvents[identifier] === undefined) {
			registeredEvents[identifier] = [];
		}

		registeredEvents[identifier].append(eventId);

		return eventId;
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
	 * Signature: callRpcMethod(socket, method, params, responseHandler) => Number
	 *
	 * responseHandler signature: func(response, error)
	 *
	 * The response handler's argument response can be undefined if an
	 * error occured. In this case, error is !== undefined. If no error
	 * occured, error is undefined.
	 *
	 * error is a JSON RPC 2.0 response error structure.
	 */
	callRpcMethod: function(socket, method, params, responseHandler) {
		var id = this.generateRequestId();

		pendingRequests[id] = responseHandler;

		socket.write(this.createJsonRpcRequest(method, params, id));

		return id;
	},

	/**
	 * Signature: generateRequestId([table]) => Number
	 *
	 * Generate a random number which is not yet registered.
	 *
	 * If table is given, it is checked if the generated id exists in
	 * the table (object / hashmap) to generate a new id if it exists.
	 *
	 * If table is not given, pendingRequests is used instead.
	 */
	generateRequestId: function (table) {
		for(;;) {
			var id = Math.floor(Math.random()*Math.pow(2,32));
			if((table && table[id]) || pendingRequests[id]) {
				continue;
			}
			return id;
		}
	},

	/**
	 * Simple parameter check. Checks if all not optional parameters are
	 * given and if they've the correct type. You can't supply more than
	 * one type, also you can't put optional parameters at the beginning.
	 *
	 * methodName: Name of the method to check
	 * socket: Socket to response on
	 * reqId: request id for the response
	 * parameters: the parameters given by the user
	 * paramTypes: mapping of parameter name to expected type ("any" for any type)
	 *
	 * Example:
	 *
	 *  function myMethod(first, second) {
	 *   var ok = parameterCheck("myMethod", socket, id, arguments, {
	 *	 	first: "string",
	 *		second: ["function", "optional"]
	 *   });
	 *   if(!ok) return;
	 *   // ...
	 *  }
	 */
	parameterCheck: function(methodName, socket, reqId, parameters, paramTypes) {
		var minParamCount = Object.keys(paramTypes).filter(function(key) {
			return (paramTypes[key][1] === "optional") ? false : true;
		}).length;

		var maxParamCount = Object.keys(paramTypes).length;

		if(parameters.length < minParamCount || parameters.length > maxParamCount) {
			if(minParamCount == maxParamCount) {
				socket.write(this.createJsonRpcError(reqId,
							"Invalid param count. "+methodName+" takes "+minParamCount+" parameters.",
							this.json_errors.invalid_params));
			} else {
				socket.write(this.createJsonRpcError(reqId,
							"Invalid param count. "+methodName+" takes at least "+minParamCount+" and max. "+maxParamCount+" parameters.",
							this.json_errors.invalid_params));
			}
			return false;
		}

		var paramIndex = 0;

		//console.log("parameters", parameters);

		for(var paramName in paramTypes) {
			var expectedType = paramTypes[paramName];
			var optional = false;

			// Parameter info is given as array, unpack it
			if(paramTypes[paramName][1] === "optional") {
				expectedType = paramTypes[paramName][0];
				optional = true;
			}

			// Check if parameter is missing
			if(parameters[paramIndex] === undefined && !optional) {
				socket.write(this.createJsonRpcError(reqId,
						paramIndex+". ("+paramName+") parameter is missing.",
						this.json_errors.invalid_params));
				return false;
			} else if(parameters[paramIndex] === undefined && optional) {
				continue;
			}

			// Check if parameter has correct type
			if(expectedType != "any" && typeof parameters[paramIndex] != expectedType) {
				socket.write(this.createJsonRpcError(reqId,
						paramIndex+". ("+paramName+") parameter must be of type "+expectedType+".",
						this.json_errors.invalid_params));
				return false;
			}

			paramIndex++;
		}

		return true;
	},


	/*
	 * JSON definitions / methods
	 */

	// Signature: addJsonError(name, number, description="") => True or Exception
	//
	// If an error with the given name exists or the error number is invalid,
	// an exception is thrown.
	//
	// Description is not used internally but shall encourage developers to
	// put in a description.
	addJsonError: function(name, number, description) {
		if(this.json_errors[name]) {
			throw new Error("Error already registered.");
		}
		if(number > -32700 || number < -32603) {
			this.json_errors[name] = number
			return true;
		} else {
			throw new Error("Invalid error code.");
		}
	},

	json_errors: {
		parse_error: 		-32700, 	// Parse error 			Invalid JSON was received by the server.
		invalid_request: 	-32600, 	// Invalid Request 		The JSON sent is not a valid Request object.
		method_not_found: 	-32601, 	// Method not found 	The method does not exist / is not available.
		invalid_params: 	-32602, 	// Invalid params 		Invalid method parameter(s).
		internal_error: 	-32603  	// Internal error 		Internal JSON-RPC error.
	},

	validateJsonRpcRequest: function(req) {
		if(req.params === undefined) {
			req.params = [];
		}
		return typeof req.method !== 'undefined' &&
				typeof req.id !== 'undefined';
	},


	validateJsonRpcResponse: function(resp) {
		return (typeof resp.result !== 'undefined' ||
				typeof resp.error !== 'undefined') &&
				typeof resp.id !== 'undefined' &&
				typeof resp.jsonrpc !== 'undefined';
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

	echoDelay: function(echoThis, delay) {
		var socket = this.socket;
		var core = this.core;
		var id = this.requestId;

		setTimeout(function() {
			socket.write(core.createJsonRpcResponse(id, echoThis));
		}, delay);
	},

	/*
	 * Signature: finishRequest(id) => Void
	 *
	 * Mark the request with the given id as answered.
	 */
	finishRequest: function(id) {
		delete pendingRequests[id];
	},

	/*
	 * registerModule(name, methods=[])
	 *
	 * Returns a token string which is used to authenticate
	 * the owner of the module (for removing the module and other
	 * privileged tasks).
	 *
	 * Returns false if there's already a module with that name.
	 *
	 */
	registerModule: function(name, methods) {
		var ok = this.core.parameterCheck("registerModule", this.socket, this.requestId, arguments, {
			name: "string",
			methods: ["object","optional"]
		});

		if(!ok) {
			return;
		}

		methods = methods || [];

		var token = this.core.registerRpcModule(name, methods, this.socket);
		this.socket.write(this.core.createJsonRpcResponse(this.requestId, token));
	},

	unregisterModule: function(name, token) {
		var module = this.core.getModule(name);

		if(!module) {
			success = false;
		} else {
			success = (module.token === token) && this.core.unregisterModule(name);
		}

		this.socket.write(this.core.createJsonRpcResponse(this.requestId, success));
	},

	/*
	 * Signature: fireEvent(name, data) => Boolean
	 *
	 * name: String
	 * data: Array
	 *
	 * If there are no listeners to the event, fireEvent returns false. Otherwise
	 * it returns true. If an error occurs while dispatching to a module,
	 * the module is skipped.
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
		var ok = this.core.parameterCheck("fireEvent", this.socket, this.requestId, arguments, {
			name:"string",
			data:"object"
		});

		if(!ok) {
			return;
		}

		var listeners = registeredEvents[name];

		if(listeners === undefined) {
			this.socket.write(this.core.createJsonRpcResponse(this.requestId, false));
			return;
		}

		for(var i=0; i < listeners.length; i++) {
			var row = eventIdToEvent[listeners[i]];

			var module = registeredModules[row[1]];
			var method = module.getMethod(row[2], true); // get hidden methods too == true

			if(typeof method !== 'function') {
				console.log("Can't fire event "+name+" to "+module+": No method. (", row[2],")");
				continue;
			}

			method.apply({
				module: module,
				socket: this.socket,
				requestId: this.core.generateRequestId(),
				core: this.core}, data);
		}

		this.socket.write(this.core.createJsonRpcResponse(this.requestId, true));
	},

	/*
	 * Signature: bindToEvent(identifier, callbackIdentifier) => Int
	 *
	 * identifier: String
	 * callbackIdentifier: String
	 *
	 * Bind remote module to event.
	 * Error response if the module in the callbackIdentifier is not loaded
	 * or the callbackIdentifier is ill-formed.
	 */
	bindToEvent: function(identifier, callbackIdentifier) {
		var ok = this.core.parameterCheck("bindToEvent", this.socket, this.requestId, arguments, {
			identifier: "string",
			callbackIdentifier: "string"
		});

		if(!ok) {
			return;
		}

		var composite = callbackIdentifier.split('.');

		if( composite.length != 2 ) {
			this.socket.write(this.core.createJsonRpcError(
				this.requestId,
				"Ill-formed callback identifier: "+callbackIdentifier+".",
				this.core.json_errors.internal_error));
			return;
		}

		var module = composite[0];
		var method = composite[1];

		if( !registeredModules[module] ) {
			this.socket.write(this.core.createJsonRpcError(
				this.requestId,
				"Receiving module "+module+" is not registered.",
				this.core.json_errors.internal_error));
			return;
		}

		var eventId = this.core.bindToEvent(identifier, module, method);

		this.socket.write(this.core.createJsonRpcResponse(this.requestId, eventId));
	},

	/**
	 * Signature: unbindFromEvent(eventId) => Boolean
	 *
	 * Return true if the event was unbind, otherwise false.
	 */
	unbindFromEvent: function(eventId) {
		var ok = this.core.parameterCheck("unbindFromEvent", this.socket, this.requestId, arguments, {
			eventId: "number"
		});

		if(!ok) {
			return;
		}

		// TODO check calling module (it shall own the event to unbind it)

		delete eventIdToEvent[eventId];

		this.socket.write(this.core.createJsonRpcResponse(this.requestId, true));
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
	getMethod: function(name, local) { throw new Execption("getMethod on raw module."); }
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

	/**
	 * Signature: getMethod(name, [local])
	 *
	 * Return the method identified by name.
	 *
	 * If boolean local is true, the exported methods list (this.methods) is ignored.
	 * See CoreModule.fireEvent for use case.
	 */
	getMethod: function(name, local) {
		if(local || this.methods.has(name)) {
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
var RpcModule = function(name, methods, socket, token) {
	Module.apply(this, [name, methods]);
	this.socket = socket;
	this.token = token;
}

RpcModule.prototype = {

	/**
	 * Signature: getMethod(name, [local])
	 *
	 * Builds a proxy method which makes an RPC call to the requested method.
	 * The result is written back to the requesting socket.
	 *
	 * The boolean local flag is used to determine if this call is used
	 * for local usage (that is, using for calling an event handler for example)
	 * or not. If local is true, the internal methods list is not checked for
	 * the calling method, allowing unexported methods to be called.
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
	 *
	 * @return function 	Proxy method for handling the request.
	 */
	getMethod: function(name, local) {
		if(local || this.methods.has(name)) {
			var module = this;
			return function() {
				// Proxy method
				//console.log("Proxycall to",name);

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
 *	- receiving module
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

	if(this.core.validateJsonRpcRequest(message)) {
		this.routeRequest(message);
	} else if(this.core.validateJsonRpcResponse(message)) {
		this.routeResponse(message);
	} else {
		console.log("Core.Dispatcher: Invalid JSON-RPC 2.0 Data:", message, "type:", typeof message);
		return false;
	}

};

Dispatcher.prototype = {

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
			console.log("Unknown method in RPC request:",methodName, method, module);
			this.socket.write(this.core.createJsonRpcError(
				request.id, "Unknown method "+methodName, this.core.json_errors.method_not_found));
			return;
		}

		method.apply({module: module, socket: this.socket, requestId: request.id, core: this.core}, request.params);
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

	// nodejs modules
	var net = require('net');
	var carrier = require('./deps/carrier/lib/carrier');

	// Local modules
	var conf = require('./lib/conf/conf.js');
	var peers = require('./lib/peers/peers.js');
	var filetransfer = require('./lib/filetransfer/filetransfer.js');

	var core = this;

	this.registerLocalModule("Core", CoreModule);
	this.registerLocalModule("Config", conf.getModule(this));
	this.registerLocalModule("Peers", peers.getModule(this));
	this.registerLocalModule("FileTransfer", filetransfer.getModule(this));

	if(process.env['CLOUD7_CORE_TEST'] != undefined) {
		var test = require('./lib/test/test.js');
		var TestModule = test.getModule(this);

		TestModule.invokeTests();

		process.exit();
	}

	this.callRpcMethodLocal("Core.fireEvent", ["Core.initDone", []]);

	// TODO better solution for port configuration
	if(process.argv.length > 2) {
		corePort = parseInt(process.argv[2]);
		console.log("alternative core port:", corePort)
	}


	process.on('uncaughtException', function(exception) {
		// TODO send general error event?
		console.log("UNCAUGHT EXCEPTION:", exception, "\nStacktrace:\n", exception.stack);
	});

	// Setup RPC server
	this.server = net.createServer(function (socket) {

		socket.on('error', function(error) {
			console.log("ERROR occured in socket comminication:", error);
		});

		carrier.carry(socket, function(data) {

			if(!socket.writable || !socket.readable) {
				console.log("Socket closed, stopping handler.");
				return;
			}

			// Overwrite write for debugging/logging purposes.
			socket.write = function(that, write) {
				return function() {
					var args = Array.valueOf(arguments);
					args[args.length] = function() { console.log("OUT:",args); };

					try {
						write.apply(that, args);
					} catch(e) {
						console.log('Error while writing to RPC socket', e);
					}
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

	}).listen(corePort, '127.0.0.1');

})


