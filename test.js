var net = require('net');
var fs = require('fs');

var files = ["Apps1.zip", "Apps2.zip", "Apps3.zip"];

var server = net.createServer(function (socket) {
	
	var rand = parseInt(Math.random()*10000 % files.length);
	var file = files[rand];
	
	var fd;
	
	var bufferSize = 4096 * 1024;
	
	var buffer = new Buffer(bufferSize);
	var offset = 0;
	var position = 0;
	
	console.log("connection", file)
	
	/*while(read > 0) {
		var res = fs.readSync(fd, 4096, offset, "");
		console.log(res[1]);
		//break;
		socket.write(res[0]);
		if(res[1] < 1) {
			break;
		}
		offset += res[1];
	}
	console.log("test");
	socket.end("");*/
	
	var f_read = function() {
		fs.read(fd, buffer, 0, bufferSize, position, f_writeback);
	};
	
	var f_writeback = function(err, bytesRead) {
		if(bytesRead < 1) {
			console.log("write end");
			socket.end("");
			return;
		}
		position += bytesRead;
		socket.write(buffer, 'binary', f_read);
	};

	fs.open(file, 'r', 0666, function(err, theFd) {
		fd = theFd;
		f_read();
	});
})

server.listen(8124, "127.0.0.1");
console.log("Server listening at 127.0.0.1:8124");