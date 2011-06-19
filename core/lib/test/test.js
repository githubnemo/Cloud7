var assert = require('assert');
var util = require('util');


/**
 * By default, this test does not test RPC communication over a socket because
 * this module is a local one.
 *
 * If you want to test remote RPC communication (over a socket) to the core,
 * you have to execute this file directly with nodejs with the port of the
 * cloud7 core as first parameter. (TODO)
 *
 * Also note that the CoreTestModule test wouldn't work remotely and therefore
 * is skipped.
 */

function getModule(Core) {

	var ok = assert.ok;
	var fail = assert.fail;
	var equal = assert.equal;
	var deepEqual = assert.deepEqual;
	var strictEqual = assert.strictEqual;


	// failTimeout(message, timeout=10000)
	function failTimeout(message, timeout) {
		return setTimeout(function() {
			fail( message );
		}, timeout || 10000);
	}


	function invokeRpcMethod(name, params, resultCallback) {
		Core.callRpcMethodLocal(name, params, resultCallback);
	}



	// Local copy of JSON-RPC error struct. Needed to lose dependency on Core module for
	// remote testing.
	var json_errors = {
		parse_error: 		-32700, 	// Parse error 			Invalid JSON was received by the server.
		invalid_request: 	-32600, 	// Invalid Request 		The JSON sent is not a valid Request object.
		method_not_found: 	-32601, 	// Method not found 	The method does not exist / is not available.
		invalid_params: 	-32602, 	// Invalid params 		Invalid method parameter(s).
		internal_error: 	-32603  	// Internal error 		Internal JSON-RPC error.
	};



	function CoreTestModule() {

		this.test_createError = function() {
			deepEqual( Core.createError("foo", "bar"), ["foo", {message: "bar"}] );
			deepEqual( Core.createError("foo", "bar", {baz: "baz"}), ["foo", {message: "bar", baz: "baz"}] );
		};

		this.test_registerLocalModule = function() {
			var module = {moduleId: "myModule"};
			var moduleName = "MyTestModule";

			Core.registerLocalModule(moduleName, module);

			ok( Core.getModule(moduleName) != undefined );
			equal( Core.getModule(moduleName).obj.moduleId, "myModule" );
		};

		this.test_unregisterLocalModule = function() {
			this.test_registerLocalModule();

			Core.unregisterModule("MyTestModule");

			ok( Core.getModule("MyTestModule") === undefined );
		};

		this.test_getMethods = function() {
			var obj1 = {foo: function() {}, _foo: function() {}};

			deepEqual( Core.getMethods(obj1), ['foo'] );

			var obj2 = {};

			deepEqual( Core.getMethods(obj2), [] );

			var obj3 = {_foo: function() {}};

			deepEqual( Core.getMethods(obj3), [] );
		};

		this.test_parameterCheck = function() {
			var fakeSocket = function(cb) {
				this.write = function(data) {
					cb(JSON.parse(data));
				};
			};

			function paramErrorCode(data) {
				ok( data.error != undefined, "Error expected, result received: "+data );
				equal( data.error.code, json_errors.invalid_params );
			}

			function success(data) {
				fail( "There should be no response but there was one: " + util.inspect(data) );
			}

			Core.parameterCheck("someMethod", new fakeSocket(paramErrorCode), 1, [12345], {first:"string"});
			Core.parameterCheck("someMethod", new fakeSocket(paramErrorCode), 1, ["foo"], {first:"number"});
			Core.parameterCheck("someMethod", new fakeSocket(paramErrorCode), 1, ["foo"], {});
			Core.parameterCheck("someMethod", new fakeSocket(paramErrorCode), 1, [], {first: "string"});
			Core.parameterCheck("someMethod", new fakeSocket(paramErrorCode), 1, [], {first: "string", second:["number","optional"]});

			Core.parameterCheck("someMethod", new fakeSocket(success), 1, ["foo"], {first: "string"});
			Core.parameterCheck("someMethod", new fakeSocket(success), 1, [], {first: ["string","optional"]});
			Core.parameterCheck("someMethod", new fakeSocket(success), 1, ["foo", 12345], {first: "string", second:["number","optional"]});
			Core.parameterCheck("someMethod", new fakeSocket(success), 1, ["foo"], {first: "string", second:["number","optional"]});
		};

	}



	function CoreModuleTestModule() {

		this.test_echo = function() {
			invokeRpcMethod("Core.echo", ["foo"], function(response) {
				equal( response.result, "foo" );
			});
		};

		this.test_echoDelay = function() {
			var startTime = Date.now();
			var delay = 400;
			var tolerance = 200;

			invokeRpcMethod("Core.echoDelay", ["foo", delay], function(response) {
				ok( Date.now() - startTime < (delay+tolerance) );
				equal( response.result, "foo" );
			});
		};

		this.test_moduleRegistration = function() {
			var moduleName = "testModule";
			var moduleToken = null; // set in testRegisterModule


			function testRegisterModule() {
				invokeRpcMethod("Core.registerModule", [moduleName], function(response) {
					ok( typeof response.result === "string", "Registration failed" );

					moduleToken = response.result;

					testUnregisterModule1();
				});
			}

			function testUnregisterModule1() {
				invokeRpcMethod("Core.unregisterModule", [moduleName, "invalidToken"], function(response) {
					strictEqual( response.result, false, "Unregistration with invalidToken succeeded." );

					testUnregisterModule2();
				});
			}

			function testUnregisterModule2() {
				invokeRpcMethod("Core.unregisterModule", [moduleName, moduleToken], function(response) {
					strictEqual( response.result, true, "Unregistration with valid token failed." );
				});
			}

			function testUnregisterModule3() {
				invokeRpcMethod("Core.unregisterModule", [moduleName, moduleToken], function(response) {
					strictEqual( response.result, false, "Unregistration on unregistered module succeeded." );
				});
			}

			testRegisterModule(); // start test chain
		};

		this.test_eventBinding = function() {

			function testBindInvalidParameters() {
				invokeRpcMethod("Core.bindToEvent", ["InvalidModule", "InvalidModule"], function(response) {
					ok( response.error != undefined );
				});
				invokeRpcMethod("Core.bindToEvent", ["InvalidModule", "Test.fooHandler"], function(response) {
					ok( response.error != undefined );
				});
				invokeRpcMethod("Core.bindToEvent", ["Test.fooEvent", "InvalidModule"], function(response) {
					ok( response.error != undefined );
				});
				invokeRpcMethod("Core.bindToEvent", ["Test.fooEvent"], function(response) {
					ok( response.error != undefined );
				});
				invokeRpcMethod("Core.bindToEvent", [], function(response) {
					ok( response.error != undefined );
				});
			}

			testBindInvalidParameters();

			// TODO

			function testUnbindInvalidParameters() {
				invokeRpcMethod("Core.unbindFromEvent", ["aStringNotANumber"], function(response) {
					ok( response.error != undefined );
				});
				invokeRpcMethod("Core.unbindFromEvent", [], function(response) {
					ok( response.error != undefined );
				});
			}

			testUnbindInvalidParameters();

			// TODO
		};

		this.test_fireEvent = function() {

			function testInvalidParmaters() {
				invokeRpcMethod("Core.fireEvent", ["Test.myTestEvent"], function(result) {
					equal( result.error.code, json_errors.invalid_params );
				});
				invokeRpcMethod("Core.fireEvent", [], function(result) {
					equal( result.error.code, json_errors.invalid_params );
				});
				invokeRpcMethod("Core.fireEvent", ["foo","bar","baz"], function(result) {
					equal( result.error.code, json_errors.invalid_params );
				});
			};

			function testFireEventNoListeners() {
				invokeRpcMethod("Core.fireEvent", ["Test.myTestEvent", ["first", "second"]], function(result) {
					strictEqual( result.result, false );
				});
			};

			function eventFireChain() {

				var timerRegistry = {};

				var receivingModule = {
					_receivedMyEvent: function(first, second) {
						clearTimeout(timerRegistry["Test._receivedMyEvent"]);
						strictEqual( first, "first" );
						strictEqual( second, "second" );
					}
				};

				function testFireEventListener1() {
					//console.log("Invoking Test.myTestEvent");

					var t = failTimeout( "testFireEventListener1: No event received in 10 seconds." );

					timerRegistry["Test._receivedMyEvent"] = t;

					var t2 = failTimeout( "testFireEventListener1: fire event timed out." );

					invokeRpcMethod("Core.fireEvent", ["Test.myTestEvent", ["first", "second"]], function(result) {
						clearTimeout(t2);
						strictEqual( result.result, true );
					});
				};

				var t1 = failTimeout("eventFireChain: registerModule timed out.");

				invokeRpcMethod("Core.registerModule", ["Test"], function(result) {

					// Result of Core.registerModule
					if(typeof result.result == "string") {
						clearTimeout(t1);
						var t2 = failTimeout("eventFireChain: bindToEvent timed out.");

						invokeRpcMethod("Core.bindToEvent", ["Test.myTestEvent", "Test._receivedMyEvent"], function(result) {
							clearTimeout(t2);
							ok( result.result );

							testFireEventListener1();
						});
					// Event call
					} else if(result.method != undefined) {
						var moduleMethodSplit = result.method.split(".");

						equal( moduleMethodSplit.length, 2, "Event response with ill-formed module.method id: "+result.method );

						receivingModule[moduleMethodSplit[1]].apply(this, result.params);
					}
				});
			};



			testInvalidParmaters();
			testFireEventNoListeners();

			eventFireChain();
		};




	}



	// Main Test Module
	//
	// Entry point for Core to invoke tests

	function TestModule() {}

	TestModule.prototype = {

		invokeTests: function() {
			console.log("\nSTARTING TESTS");

			this.invokeModuleTests(new CoreTestModule(), "Core Test");
			this.invokeModuleTests(new CoreModuleTestModule(), "Core Module Test");

			console.log("TESTS FINISHED");
		},

		invokeModuleTests: function(module, name) {
			console.log("Invoking tests for", name);

			for(var prop in module) {
				console.log("*", prop);
				if(prop.match(/^test_/) != null && typeof module[prop] == 'function') {
					module[prop]();
				}
			}
		},

	};


	return new TestModule();
}

module.exports = {getModule: getModule};

// TODO called directly check
//
// => remove CoreTestModule from test (won't work remotely)
//
// => replace invokeRpcMethod with remote invokation
