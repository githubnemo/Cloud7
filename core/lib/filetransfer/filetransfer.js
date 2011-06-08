var net = require('net');
var fs = require('fs');
var crypto = require('crypto');

// Hash for a specific file in the network
function networkFileHash(networkName, fileHash) {
	var hasher = crypto.createHash('sha1');
	hasher.update(networkName);
	hasher.update(fileHash);
	return hasher.digest('hex');
}


function getModule(Core) {

	function answerRequest(socket, data) {
		socket.write(data);
		Core.callRpcMethodLocal("Core.finishRequest", [data.id]);
	}


	function FileTransfer() {

		this.peersModule = Core.getModule("Peers")

		this.peerRequestEventId = Core.bindToEvent("Peers.messageReceived", "FileTransfer", "_peersMessageReceived");
		this.peerResponseEventId = Core.bindToEvent("Peers.responseReceived", "FileTransfer", "_peersResponseReceived");
		this.joinEventId = Core.bindToEvent("Peers.joinedNetwork", "FileTransfer", "_networkJoined");
		this.leaveEventId = Core.bindToEvent("Peers.leftNetwork", "FileTransfer", "_networkLeft");

		// Folder which is public for all other peers
		// TODO configurable somehow
		this.shareFolder = "/home/nemo/Downloads/"

		// Shared/Public files
		// { file: <filename>, folder: <path to folder> }
		this.publicFiles = this._getPublicFiles();

		console.log("I share", this.publicFiles.length, "files in", this.shareFolder);

		// Setup a watcher which refreshes this.publicFiles whenever
		// something in the share folder changes.
		this._startPublicFileWatcher();


		// Memory of download requests issued by us.
		// { id: {
		//		network: <network name>,
		//		sourcePeer: <peer id to fetch from>,
		//		fileName: <name of the file to download>,
		//		destinationPath: <path to save the file to>,
		//		callback: <function to be called if response is received>
		// } }
		this.ownDownloadRequests = {};

		// Memory of networks to publish file list to.
		// { <networkname> : <interval id> }
		this.publishingNetworks = {};

		// Time to live of the file list of this peer.
		// This is also the republishing interval.
		this.fileListTTL = 60000;

		// Table of active servers for files
		// { <file> : <server obj> }
		this.activeServers = {};

		// Everything should be set up. Start publishing.
		// TODO fetch active networks (if any) and start publishing
		//this._startPublishingFileList();
	}


	// A -> B [getFile(Foo, <networkName>)]
	// B -> A [{ip: <ip>, port: <port>}]
	//
	// A [download from ip/port until finished].


	// [Network joined]
	// -> publish public files under special hashes so they can be found
	//    by other peers and contact us


	// [Network left]
	// -> remove file publishing routine for the network


	// How to get all files in the network:
	// for all peers in network do:
	// 	peer.listFiles
	//
	// TODO:  optimize this, maybe put peers who have files into
	// TODO:: a key in the DHT so only they need to be questioned.

	FileTransfer.prototype = {

		// ------------------------------------
		// Event handlers
		// ------------------------------------

		// Route incoming file transfer messages from peers.
		// Called from core event dispatcher.
		_peersMessageReceived: function(senderId, jsonRpcRequest) {
			var self = this.module.obj;

			switch(jsonRpcRequest.method) {
				case "FileTransfer.getFile":
					// FileTransfer.getFile(fileName, networkName)
					self._answerFileRequest(senderId, jsonRpcRequest);
					break;

				case "FileTransfer.listFiles":
					self._answerListFilesRequest(senderId, jsonRpcRequest);
					break;
			}
		},


		_peersResponseReceived: function(senderId, jsonRpcResponse) {
			var self = this.module.obj;

			if(self.ownDownloadRequests[jsonRpcResponse.id]) {
				// Handle it, it's for us :)
				var downloadData = self.ownDownloadRequests[jsonRpcResponse.id];

				try {
					var data = JSON.parse(jsonRpcResponse.result);
					downloadData.callback(jsonRpcResponse.id, data.ip, data.port)
				} catch(e) {
					console.log("FileTransfer: error while parsing response", jsonRpcResponse);
				}
			}
		},


		_networkJoined: function(networkName) {
			this._startPublishingFileList(networkName);
		},


		_networkLeft: function(networkName) {
			this._stopPublishingFileList(networkName);
		},


		_getPublicFile: function(networkName, fileName) {
			// TODO make depending on networks
			return this.publicFiles[fileName];
		},


		// Open a server which serves the requested file (if found)
		// and send the data to the client.
		_answerFileRequest: function(senderId, request) {
			if(request.params.length != 2) {
				var error = Core.createJsonRpcError(request.id, "Invalid parameter count", Core.json_errors.invalid_params);
				Core.callRpcMethodLocal("Peers.sendMessage", [senderId, error]);

				return;
			}

			var filename = request.params[0];
			var network = request.params[1];

			var file = this._getPublicFile(network, filename);

			if(file === undefined) {
				var error = Core.createJsonRpcError(request.id, "File not found", Core.json_errors.internal_error);
				Core.callRpcMethodLocal("Peers.sendMessage", [senderId, error]);

				return;
			}


			this._startFileServer(file, function(ip, port) {
				if(ip == null || port == null) {
					// Error occured
					console.log("Error while starting file server");
					// TODO handle error
					return;
				}

				var response = Core.createJsonRpcResponse(request.id, serverObj);

				Core.callRpcMethodLocal("Peers.sendMessage", [senderId, response]);
			});
		},


		_answerListFilesRequest: function(senderId, request) {
			var response = Core.createJsonRpcResponse(request.id, Object.keys(this.publicFiles));
			Core.callRpcMethodLocal("Peers.sendMessage", [senderId, response]);
		},


		// ------------------------------------
		// Unexported local methods
		// ------------------------------------

		// Watch share folder for changes and refresh the public
		// files struct then.
		_startPublicFileWatcher: function() {
			var self = this;

			return fs.watchFile(this.shareFolder, function(curr,prev) {
				console.log("Refreshing public files...");
				// TODO different networks should have different public files
				self.publicFiles = self._getPublicFiles();
			});
		},


		// Serve the file given.
		//
		// addressCallback signature: addressCallback(ip, port)
		//
		// After successful creation, addressCallback is called with the
		// address data. If creation fails, ip and port is null.
		//
		_startFileServer: function(fileLocation, addressCallback) {
			if(this.activeServers[fileLocation]) {
				return;
			}

			// TODO limit max open connections
			var server = net.createServer({}, function(socket) {
				console.log("In serve file for",fileLocation);
				fs.readFile(fileLocation, function (err, data) {
					if (err) {
						console.log("Error while reading file to send", fileLocation, err);
					} else {
						console.log("Starting to transmit file",fileLocation);
						socket.write(data);
						socket.end();
						console.log("Transmitted file",fileLocation);
					}
				});
			});

			// listen on random port
			server.listen(function() {
				var address = server.address();
				console.log("opened file server on", address);

				this.activeServers[fileLocation] = server;
				addressCallback(address.ip, address.port);
			});
		},


		// Returns a list of objects which represent the files this node
		// shares with others in the given network.
		//
		// The structure of the object is as follows:
		// { file: <filename>, folder: <path to folder> }
		//
		// TODO:  different networks should have different files,
		// TODO:: maybe with share folders configureable per network
		_getPublicFiles: function() {

			function readPublicPaths(folder) {
				var publicFiles = [];

				var files = fs.readdirSync(folder);

				for(var i=0; i < files.length; i++) {
					var path = folder + "/" + files[i];
					var stat = null;
					try {
						stat = fs.statSync(path);
					} catch(e) {
						continue;
					}

					if(stat.isFile()) {
						publicFiles.unshift({ file: files[i], folder: folder });
					} else {
						publicFiles = publicFiles.concat( readPublicPaths(path) );
					}
				}

				return publicFiles;
			}

			return readPublicPaths(this.shareFolder);
		},


		// Publish public file list in the DHT
		_startPublishingFileList: function(networkName) {
			self = this;

			console.log("_startPublishingFileList:", networkName)

			function fileListRefresher() {
				console.log("Refreshing file list in DHT.");

				Core.callRpcMethodLocal("Peers.getMyId", [], function(response) {
					var peerId = response.result;

					console.log("Got peerId", peerId, networkName);

					for(var i=0; i < self.publicFiles.length; i++) {
						var fileObj = self.publicFiles[i];

						var fileHash = networkFileHash(networkName, fileObj.file);
						Core.callRpcMethodLocal("Peers.DHTput", [fileHash, peerId, self.fileListTTL / 1000]);
					}
				});
			}

			self.publishingNetworks[networkName] = setInterval(fileListRefresher, self.fileListTTL);

			fileListRefresher();
		},


		// Stop doing what _startPublishingFileList started.
		_stopPublishingFileList: function(networkName) {
			clearInterval(this.publishingNetworks[networkName]);
		},


		// Generate a hash from the file name
		_fileNameHash: function(fileName) {
			var hasher = crypto.createHash('sha1');
			hasher.update(fileName);
			return hasher.digest('hex');
		},


		// Retrieves the peers in the network which have the given file.
		// callback signature: callback(peerList)
		_findFileInNetwork: function(networkName, fileName, callback) {
			var fnHash = this._fileNameHash(fileName)
			var fileNetworkHash = networkFileHash(networkName, fnHash);

			Core.callRpcMethodLocal("Peers.DHTget", [fileNetworkHash], function(response) {
				callback(response.result);
			});
		},


		_registerOwnDownloadRequest: function(id, networkName, sourcePeerId, fileName, destinationPath, callback) {
			this.ownDownloadRequests[id] = {
				network: networkName,
				sourcePeer: sourcePeerId,
				fileName: fileName,
				destinationPath: destinationPath,
				callback: callback
			};
		},


		_deleteOwnDownloadRequest: function(id) {
			delete this.ownDownloadRequests[id];
		},


		// Handles the answer of uploading peer
		_downloadResponseHandler: function(id, ip, port) {
			var downloadData = this.ownDownloadRequests[id];

			var path = downloadData.destinationPath;
			var stream = fs.createWriteStream(path);

			var con = net.createConnection(port, ip);

			console.log('start downloading file to',path,'from',ip,port);

			con.on('data', function(data) {
				stream.write(data);
			});

			con.on('end', function() {
				stream.end();
				stream.destroy();
				console.log('finished downloading file to',path,'from',ip,port);
			});
		},


		// callback signature: callback(reqId)
		// 	reqId:Number
		//
		// Dispatch download request to the peer who claims to have the file.
		// The dispatched download's ID is passed to the callback so the caller
		// can track the download later on.
		_startDownloadFileFromPeer: function(networkName, peerId, fileName, destinationPath, callback) {
			var requestId = Core.generateRequestId(this.ownDownloadRequests);

			var downloadRequest = createJsonRpcRequest("FileTransfer.getFile", [fileName, networkName], requestId);

			this._registerOwnDownloadRequest(requestId, networkName, peerId, fileName, destinationPath, _downloadResponseHandler);

			Core.callRpcMethodLocal("Peers.sendMessage", [peerId, downloadRequest]);

			callback(requestId);
		},


		// ------------------------------------
		// Exported RPC methods
		// ------------------------------------


		// Download a file from the given network.
		//
		// The hased file name will be used as identifiaction.
		// The local path is the destination folder.
		//
		// Returns true if the download is started.
		retrieveFile: function(networkName, fileName, localPath) {
			var socket = this.socket;
			var moduleRequestId = this.requestId;
			var self = this.module.obj;

			Core.callRpcMethodLocal("Peers.getJoinedNetworks", [], function(response) {

				if(response.error !== undefined) {

					console.log("Error while retrieving joined networks", response);

					answerRequest(socket, Core.createJsonRpcError(
							moduleRequestId, "Error while retrieving joined networks: "+response.toString(),
							Core.json_errors.internal_error));

				} else {

					if(networkName in response.result) {
						// We joined the network so we can do things

						self._findFileInNetwork(networkName, fileName, function(peers) {
							if(peers.length == 0) {
								answerRequest(socket, Core.createJsonRpcError(
										moduleRequestId,
										"File "+fileName+" not found in network.",
										Core.json_errors.internal_error));
							} else {
								// Start download and wait for successful deploy.
								// Writes an ID for the download to the sender so he can track the download.
								//
								// TODO eventually choose random peer to balance load?
								//
								// TODO enable retry at other peer if download from this peer fails
								self._startDownloadFileFromPeer(networkName, peers[0], fileName, localPath, function(id) {
									answerRequest(socket, Core.createJsonRpcResponse(moduleRequestId, id));
								});
							}
						});


					} else {
						console.log("retrieveFile on not joined network.");

						socket.write(Core.createJsonRpcError(
							moduleRequestId, "Network "+networkName+" is not joined.", Core.json_errors.internal_error));
					}

				}
			});
		},

		// List files from peers in the network
		listFiles: function(networkName) {
			Core.callRpcMethodLocal("Peers.listPeers", [], function(response) {
				// TODO handle error

				var peerList = response.result;

				for(var i=0; i < peerList.length; i++) {
					var peerId = peerList[i];
					// TODO everything for listing files
					Core.callRpcMethodLocal("Peers.sendMessage", [peerId, fileQuery]);
				}
			});

			// Timeout for finishing this request.
			setTimeout(function() {
				Core.callRpcMethodLocal("Core.finishRequest", [moduleReqId]);
			}, 30000);
		},
	};

	return new FileTransfer();
}

module.exports = {getModule: getModule};
