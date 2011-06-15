var os = require('os');
var cproc = require('child_process');

// TODO test error cases and different console language settings which may interfere

// responseCb(gateway)
//
function getDefaultRoute(responseCb) {
	if(!responseCb) {
		return null;
	}

	var osType = os.type();

	if(osType == "Linux") {
		return getDefaultRouteLinux(responseCb);
	} else if(osType == "FreeBSD" || osType == "Darwin") {
		return getDefaultRouteBSD(responseCb);
	} else if(osType == "Windows" || osType.match(/cygwin/i)) {
		return getDefaultRouteWindows(responseCb);
	} else {
		throw new Error("Unknown OS:" + osType);
	}
	return null;
}


function getDefaultRouteLinux(responseCb) {
	// Get default route, parse gateway. If gateway is *, null is returned.
	return cproc.exec('route -n | grep -E "^0.0.0.0"| sed -e "s/  //g" | cut -d " " -f 2', function(error, stdout, stderr) {
		var gateway = stdout.trim();

		console.log("getDefaultRouteLinux:", gateway);

		if(gateway === "*") {
			responseCb(null);
		} else {
			responseCb(gateway);
		}
	});
}

function getDefaultRouteBSD(responseCb) {
	return cproc.exec('route -n get default | grep -E "^[ ]*gateway" | cut -d ":" -f 2', function(error, stdout, stderr) {
		var gateway = stdout.trim();

		console.log("getDefaultRouteBSD:", gateway);

		if(gateway === "0.0.0.0") {
			// No gateway set
			responseCb(null);
		} else {
			responseCb(gateway);
		}
	});
}

function getDefaultRouteWindows(responseCb) {

	return cproc.exec('route print 0.0.0.0 | findstr 0.0.0.0', function(error, stdout, stderr) {
		var routeString = stdout.trim();

		var gateway = routeString.split(' ').filter(function(x) { return x.length > 0 })[2];

		console.log("getDefaultRouteWindows:", gateway)

		responseCb(gateway);
	});
}

module.exports = {getDefaultRoute: getDefaultRoute};
