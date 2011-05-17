var os = require('os');
var cproc = require('child_process');

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
	} else if(osType == "Windows") {
		return getDefaultRouteWindows(responseCb);
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
	console.log("getDefaultRouteWindows: Not implemented yet...");

	responseCb(null); // TODO

	return null;
}

module.exports = {getDefaultRoute: getDefaultRoute};
