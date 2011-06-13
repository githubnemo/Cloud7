var assert = require('assert');


function getModule(Core) {

	var ok = assert.ok;
	var fail = assert.fail;
	var equal = assert.equal;
	var deepEqual = assert.deepEqual;


	function invokeRpcMethod(name, params, resultCallback) {
		Core.callRpcMethodLocal(name, params, resultCallback);
	}


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

	}



	function CoreModuleTestModule() {

		this.test_echo = function() {
			invokeRpcMethod("Core.echo", ["foo"], function(response) {
				equal( response.result, "foo" );
			});
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
				console.log(prop);
				if(prop.match(/^test_/) != null && typeof module[prop] == 'function') {
					module[prop]();
				}
			}
		},

	};


	return new TestModule();
}

module.exports = {getModule: getModule};
