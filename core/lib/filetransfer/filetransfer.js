var net = require('net');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

// Hash for a specific file in the network
//
// Takes fileHash because it's not clear which is the hash data
// of a file.
function networkFileHash(networkName, fileHash) {
	var hasher = crypto.createHash('sha1');
	hasher.update(networkName);
	hasher.update(fileHash);
	return hasher.digest('hex');
}


// Split too long lists in sublists so they don't exceed a given limit.
// If an element is bigger than the limitPerList, an exception is thrown.
//
// Signature: splitInLists(list, [limitPerList])
//
// list : List[String]
//
// Default limitPerList: 5000 (byte)
//
// Tests:
/*
String.prototype.repeat = function(times) { var s=""; for(var i=0; i<times; i++) s+=this; return s; }

console.log( splitInLists(["A".repeat(40), "B".repeat(40), "C".repeat(40)], 40) ); // [[A...],[B...],[C...]]
console.log( splitInLists(["A".repeat(40), "B".repeat(40), "C".repeat(40)], 80) ); // [[A...B...],[C...]]
console.log( splitInLists(["A".repeat(40), "B".repeat(40), "C".repeat(40), "D".repeat(40)], 80) ); // [[A...B...],[C...D...]]
console.log( splitInLists(["A".repeat(80), "B".repeat(40), "C".repeat(40)], 80) ); // [[A...],[B...C...]]
*/
function splitInLists(list, limitPerList) {
	if(limitPerList == undefined) {
		limitPerList = 5000; // byte
	}

	var currentCount = 0;
	var lastEnd = 0;
	var lists = [];

	for(var i=0; i < list.length; i++) {
		if(list[i].length > limitPerList) {
			throw "element " + i + " is bigger than limit per list"
		}

		if(currentCount+list[i].length == limitPerList) { // fits exactly (fills up the list)
			lists = lists.concat([list.slice(lastEnd, i+1)]);
			lastEnd = i+1;
			currentCount = 0;
		} else if(currentCount+list[i].length > limitPerList) { // does not fit anymore
			lists = lists.concat([list.slice(lastEnd, i)]);
			lastEnd = i;
			currentCount = list[i].length;
		} else { // fits
			currentCount += list[i].length;
		}
	}

	// Apply pending lists
	if(currentCount != 0) {
		lists = lists.concat([list.slice(lastEnd, i)]);
	}

	return lists;
}


function getModule(Core) {

	function answerRequest(socket, data) {
		socket.write(data);
		Core.callRpcMethodLocal("Core.finishRequest", [data.id]);
	}


	function setupModuleErrors() {
		Core.addJsonError("FileTransfer.fileServerStart", 	-2000, "File server start went wrong.");
		Core.addJsonError("FileTransfer.noSuchFile", 		-2001, "File or directory supplied/used not found.");
	}


	function FileTransfer() {

		setupModuleErrors();

		this.peersModule = Core.getModule("Peers")

		this.peerRequestEventId = Core.bindToEvent("Peers.messageReceived", "FileTransfer", "_peersMessageReceived");
		this.peerResponseEventId = Core.bindToEvent("Peers.responseReceived", "FileTransfer", "_peersResponseReceived");
		this.joinEventId = Core.bindToEvent("Peers.joinedNetwork", "FileTransfer", "_networkJoined");
		this.leaveEventId = Core.bindToEvent("Peers.leftNetwork", "FileTransfer", "_networkLeft");

		// Folder which is public for all other peers
		// { network: folder }
		// TODO configurable over conf module
		this.shareFolder = {};

		// Default share folder to use for a network if no other folder is set.
		this.defaultShareFolder = process.env["CLOUD7_SHARE_FOLDER"];

		// Shared/Public files
		// { network: [
		// 		{ file: <filename>, folder: <path to folder>, size: <size in bytes> }
		// ] }
		this.publicFiles = {};


		// Memory of misc. requests like file list retrieval.
		// { id: {
		// 		callback: <callback>
		// } }
		this.ownRequests = {};

		// Memory of download requests issued by us.
		// { id: {
		//		network: <network name>,
		//		sourcePeer: <peer id to fetch from>,
		//		fileName: <name of the file to download>,
		//		destinationPath: <path to save the file to>,
		//		callback: <function to be called if response is received>,
		//		received: <bytes received so far>,
		//		size: <bytes in total>,
		//		checksum: <checksum of file>,
		//		startTime: <time stamp of start time>
		// } }
		this.ownDownloadRequests = {};

		// Memory of networks to publish file list to.
		// { <networkname> : <interval id> }
		this.publishingNetworks = {};

		// Time to live of the file list of this peer.
		// This is also the republishing interval.
		this.fileListTTL = 60000;

		// Everything should be set up. Start publishing.
		// TODO fetch active networks (if any) and start publishing
		//this._startPublishingFileList();
	}


	// A -> B [getFile(Foo, <networkName>)]
	// B -> A [{ip: <ip>, port: <port>, size: <bytes>, checksum: <hash>}]
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
					// FileTransfer.listFiles(networkName)
					self._answerListFilesRequest(senderId, jsonRpcRequest);
					break;
			}
		},


		_peersResponseReceived: function(senderId, jsonRpcResponse) {
			var self = this.module.obj;

			if(self.ownDownloadRequests[jsonRpcResponse.id]) {
				// Handle it, it's for us :)
				var downloadData = self.ownDownloadRequests[jsonRpcResponse.id];


				if(jsonRpcResponse.result) {
					var data = jsonRpcResponse.result;

					if(data.ip == undefined || data.port == undefined ||
					   data.size == undefined || data.checksum == undefined) {

						console.log("FileTransfer: Missing data fields (", data, ")");
						self._deleteOwnDownloadRequest(jsonRpcResponse.id);
					} else {
						data.ip = self.peersModule.obj.node.getPeerAddress(senderId);
						downloadData.callback.apply(self, [jsonRpcResponse.id, data.ip, data.port, data.size, data.checksum])
					}

				} else {
					if(jsonRpcResponse.error != undefined) {
						// TODO report error via event or so
						console.log("FileTransfer: Error: ", jsonRpcResponse.error);
					} else {
						console.log("FileTransfer: Ill-formed message: ", data);
					}
				}


			} else if(self.ownRequests[jsonRpcResponse.id]) {
				// Call responsible callback and remove request from request map

				self.ownRequests[jsonRpcResponse.id].callback(jsonRpcResponse);
			}
		},


		_networkJoined: function(networkName) {
			var self = this.module.obj;

			self.shareFolder[networkName] = self.defaultShareFolder;
			self.publicFiles[networkName] = self._getPublicFiles(networkName);

			try {
				fs.statSync(self.defaultShareFolder);
			} catch(e) {
				console.log("Default share folder (", self.defaultShareFolder, ") not found: ", e);
			}

			console.log("I share", self.publicFiles[networkName].length, "files in network", networkName);

			self._startPublishingFileList(networkName);
		},


		_networkLeft: function(networkName) {
			var self = this.module.obj;

			delete self.shareFolder[networkName];
			delete self.publicFiles[networkName];

			self._stopPublishingFileList(networkName);
		},


		// return undefined if file is not found
		_getPublicFile: function(networkName, fileName) {
			console.log("_getPublicFile(",networkName,",",fileName,"):", this.publicFiles[networkName]);

			var matching = this.publicFiles[networkName].filter(function(e) { if(e.file == fileName) return e; });

			if(matching.length > 0) {
				return matching[0];
			}
			return undefined;
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
				var error = Core.createJsonRpcError(request.id, "File not found in network "+network+": "+filename, Core.json_errors.internal_error);
				Core.callRpcMethodLocal("Peers.sendMessage", [senderId, error]);

				return;
			}

			var filePath = path.join(file.folder,file.file);

			console.log("ATTEMPT TO SERVE FILE", file, "path:", filePath);

			this._startFileServer(filePath, function(ip, port, file) {
				if(ip == null || port == null) {
					// Error occured
					console.log("Error while starting file server");

					var errorResponse = Core.createJsonRpcError(request.id,
							"File server start failed.",
							Core.json_errors["FileTransfer.fileServerStart"]);

					Core.callRpcMethodLocal("sendMessage", [senderId, errorResponse]);

					return;
				}

				console.log("IN SERVER HANDLER FOR FILE", file);

				var fileSize = file.size;
				var fileChecksum = "f8a9fcd0170d9ef0f03891f72f21568d6895e66a"; // TODO compute sha1 checksum

				var downloadInfo = {ip: ip, port: port, size: fileSize, checksum: fileChecksum};
				var response = Core.createJsonRpcResponse(request.id, downloadInfo);

				Core.callRpcMethodLocal("Peers.sendMessage", [senderId, response]);
			});
		},


		// File list answers can be split up to many lists. The receiver must be
		// prepared to receive a bunch of lists under the same request id.
		//
		// TODO flood protection
		//
		_answerListFilesRequest: function(senderId, request) {
			var network = request.params[0];

			if(network === undefined) {
				var response = Core.createJsonRpcError(request.id, "Network required", Core.json_errors.invalid_params);
				Core.callRpcMethodLocal("Peers.sendMessage", [senderId,response]);

				return;
			}

			if(!this.publicFiles[network]) {
				var response = Core.createJsonRpcError(request.id, "Network not joined", Core.json_errors.internal_error);
				Core.callRpcMethodLocal("Peers.sendMessage", [senderId,response]);

				return;
			}

			function createSplitableFileObject(file, size) {
				var obj = {file: file, size: size};
				obj.length = file.length + String(size).length;
				return obj;
			}

			var lists = splitInLists(this.publicFiles[network].map(function(e) { return createSplitableFileObject(e.file, e.size); }), 400);

			for(var i=0; i < lists.length; i++) {

				var response = Core.createJsonRpcResponse(request.id, lists[i].map(function(e) {delete e.length; return e;}));

				console.log("_answerListFilesRequest response is", response.length,"chars.")

				Core.callRpcMethodLocal("Peers.sendMessage", [senderId, response]);
			}
		},


		// ------------------------------------
		// Unexported local methods
		// ------------------------------------

		// Watch share folder for changes and refresh the public
		// files struct then.
		_startPublicFileWatcher: function(networkName) {
			var self = this;

			if(!this.shareFolder[networkName]) {
				console.log("Not watching files because no shareFolder is set.");
				return;
			}

			return fs.watchFile(this.shareFolder[networkName], function(curr,prev) {
				console.log("Refreshing public files...");
				self.publicFiles[networkName] = self._getPublicFiles(networkName);
			});
		},


		// Serve the file given.
		//
		// addressCallback signature: addressCallback(ip, port, filePath)
		//
		// After successful creation, addressCallback is called with the
		// address data. If creation fails, ip and port is null.
		//
		_startFileServer: function(fileLocation, addressCallback) {
			console.log("Starting file server for", fileLocation);

			var self = this;

			// TODO limit max open servers, e.g. by sharing server instances

			// TODO limit max open connections

			var server = net.createServer({}, function(socket) {
				console.log("In serve file for",fileLocation);

				var server = this;

				socket.on('error', function(error) {
					var error = Core.createError('FileTransfer.transmitSocketError', error, {fileLocation: fileLocation});

					Core.callRpcMethodLocal('Core.fireEvent', ['Core.error', error]);
				});

				fs.readFile(fileLocation, function (err, data) {
					if (err) {
						console.log("Error while reading file to send", fileLocation, err);

						var error = Core.createError('FileTransfer.readFileError', err, {fileLocation: fileLocation});

						Core.callRpcMethodLocal('Core.fireEvent', ['Core.error', error]);
					} else {
						console.log("Starting to transmit file",fileLocation);

						try {
							socket.write(data);

							socket.end();

							console.log("Transmitted file",fileLocation);
						} catch(e) {
							console.log("error in transmitting file",fileLocation,":",e);

							var error = Core.createError('FileTransfer.transmitFile', e, {fileLocation: fileLocation});

							Core.callRpcMethodLocal('Core.fireEvent', ['Core.error', error]);
						}

						// Close server
						server.close();
					}
				});
			});

			// listen on random port
			server.listen(function() {
				var address = server.address();

				console.log("opened file server on", address);

				addressCallback(address.address, address.port, fileLocation);
			});
		},


		// Returns a list of objects which represent the files this node
		// shares with others in the given network.
		//
		// The structure of the object is as follows:
		// { file: <filename>, folder: <path to folder> }
		//
		_getPublicFiles: function(networkName) {

			function readPublicPaths(folder) {
				var publicFiles = [];

				if(!folder) {
					console.log("Not reading files because no share folder is set.");
					return [];
				}

				var files = [];

				try {
					files = fs.readdirSync(folder);
				} catch(e) {
					// TODO report error to user somehow?
					console.log("_getPublicFiles: Error while reading", folder, ":", e);
					return publicFiles;
				}

				for(var i=0; i < files.length; i++) {
					var path = folder + "/" + files[i];
					var stat = null;
					try {
						stat = fs.statSync(path);
					} catch(e) {
						continue;
					}

					if(stat.isFile()) {
						publicFiles.unshift({ file: files[i], folder: folder, size: stat.size });
					} else {
						publicFiles = publicFiles.concat( readPublicPaths(path) );
					}
				}

				return publicFiles;
			}

			return readPublicPaths(this.shareFolder[networkName]);
		},


		_startFileListingServer: function(dataCallback, addressCallback) {
			var server = net.createServer({}, function(socket) {
				dataCallback(this, socket);
			});

			// listen on random port
			server.listen(function() {
				var address = server.address();
				console.log("opened file listing server on", address);

				addressCallback(address.address, address.port);
			});
		},


		_stopFileListingServer: function(server) {
			// Throws exception if already closed...
			try {
				server.close();
			} catch(e) {}
		},


		// Publish public file list in the DHT
		_startPublishingFileList: function(networkName) {
			var self = this;

			console.log("_startPublishingFileList:", networkName)

			function fileListRefresher() {
				// TODO:  supply file content hash for every file to distinguish
				// TODO:: files with same name but different content
				console.log("Refreshing file list in DHT.");

				Core.callRpcMethodLocal("Peers.getMyId", [], function(response) {
					var peerId = response.result;

					console.log("Got peerId", peerId, networkName);

					function add(i) {
						if(i >= self.publicFiles[networkName].length) {
							return;
						}

						var fileObj = self.publicFiles[networkName][i];
						var fileHash = networkFileHash(networkName, self._fileNameHash(fileObj.file));

						//console.log("adding",fileHash,"(",fileObj.file,")to DHT")

						Core.callRpcMethodLocal("Peers.DHTput", [fileHash, peerId, self.fileListTTL / 1000], function() {
							setTimeout(add, 0, i+1);
						});
					}

					add(0);
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
				console.log("DHTget(",fileNetworkHash,"):",response);
				callback(response.result);
			});
		},


		_registerOwnRequest: function(id, callback) {
			this.ownRequests[id] = {
				callback: callback
			};
		},


		_deleteOwnRequest: function(id) {
			delete this.ownRequests[id];
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


		_fireDownloadStartedEvent: function(id) {
			Core.callRpcMethodLocal("Core.fireEvent", ["FileTransfer.downloadStarted", id]);
		},


		// Handles the answer of uploading peer
		// TODO use checksum to validate downloaded file
		_downloadResponseHandler: function(id, ip, port, size, checksum) {
			var self = this;
			var downloadData = this.ownDownloadRequests[id];

			downloadData.size = size;
			downloadData.received = 0;
			downloadData.checksum = checksum;
			downloadData.startTime = Date.now();

			var path = downloadData.destinationPath;
			var stream = fs.createWriteStream(path);

			var con = net.createConnection(port, ip);

			console.log('start downloading file to',path,'from',ip,port);

			this._fireDownloadStartedEvent(id);

			con.on('data', function(data) {
				stream.write(data);
				downloadData.received += data.length;
			});

			con.on('end', function() {
				stream.end();
				//stream.destroy();
				console.log('finished downloading file to',path,'from',ip,port,"download info:",downloadData);
				self._deleteOwnDownloadRequest(id);
			});

			con.on('error', function() {
				self._deleteOwnDownloadRequest(id);
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

			var downloadRequest = Core.createJsonRpcRequest("FileTransfer.getFile", [fileName, networkName], requestId);

			this._registerOwnDownloadRequest(requestId, networkName, peerId, fileName, destinationPath, this._downloadResponseHandler);

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

					if(response.result.indexOf(networkName) >= 0) {
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

						answerRequest(socket, Core.createJsonRpcError(
							moduleRequestId,
							"Network "+networkName+" is not joined. ("+response.result+")",
							Core.json_errors.internal_error));
					}

				}
			});
		},

		listMyFiles: function(networkName) {
			// TODO
		},


		downloadInfo: function(id) {
			var self = this.module.obj;
			if(self.ownDownloadRequests[id]) {
				var info = {
					received: self.ownDownloadRequests[id].received,
					size: self.ownDownloadRequests[id].size,
					checksum: self.ownDownloadRequests[id].checksum,
					name: self.ownDownloadRequests[id].fileName,
					destination: self.ownDownloadRequests[id].destinationPath,
					network: self.ownDownloadRequests[id].network,
					startTime: self.ownDownloadRequests[id].startTime
				};

				answerRequest(this.socket, Core.createJsonRpcResponse(this.requestId, info));
			} else {
				answerRequest(this.socket, Core.createJsonRpcError(this.requestId, "Download not found.", Core.json_errors.internal_error));
			}
		},


		setShareFolder: function(networkName, folder) {
			var self = this.module.obj;
			var requestId = this.requestId;
			var response = null;

			if(!self.shareFolder[networkName]) {
				response = Core.createJsonRpcError(requestId, "Network not joined", Core.json_errors.internal_error);
			} else {

				try {
					fs.statSync(folder);
				} catch(e) {
					console.log("Share folder (", folder, ") not found: ", e);
					response = Core.createJsonRpcError(requestId, e.message, Core.json_errors["FileTransfer.noSuchFile"]);
				}

				if(response === null) { // No error occured
					self.shareFolder[networkName] = folder;
					self.publicFiles[networkName] = self._getPublicFiles(networkName);

					response = Core.createJsonRpcResponse(requestId, true);
				}
			}

			answerRequest(this.socket, response);
		},


		getShareFolder: function(networkName) {
			var self = this.module.obj;
			var requestId = this.requestId;
			var response = null;

			if(!self.shareFolder[networkName]) {
				response = Core.createJsonRpcError(requestId, "Network not joined", Core.json_errors.internal_error);
			} else {
				response = Core.createJsonRpcResponse(requestId, self.shareFolder[networkName]);
			}

			answerRequest(this.socket, response);
		},


		// List files from peers in the network
		//
		// Returns ip/port of a socket on which the search results (JSON lists)
		// are send to.
		//
		// After a timeout (30 seconds) 'END\n' is send to the
		// socket and the socket is closed.
		//
		listFiles: function(networkName) {
			var socket = this.socket;
			var moduleReqId = this.requestId;
			var self = this.module.obj;

			Core.callRpcMethodLocal("Peers.listPeers", [networkName], function(response) {
				// TODO handle error

				console.log("listFiles: listPeers result:", networkName, response);

				var peerList = response.result;

				self._startFileListingServer(function(server, listSocket) {
					var listenTimeout = 30000; // How many msec we listen for files

					for(var i=0; i < peerList.length; i++) {
						var peerId = peerList[i];
						var requestId = Core.generateRequestId();
						var fileQuery = Core.createJsonRpcRequest('FileTransfer.listFiles', [networkName], requestId);

						// FIXME should probably not access node directly
						if(peerId == self.peersModule.obj.node.id) {
							console.log("listFiles: ignoring self.");
							continue;
						}

						self._registerOwnRequest(requestId, function(response) {
							if(response.result !== undefined) {
								try {
									listSocket.write(JSON.stringify(response.result) + "\n");
								} catch(e) {
									console.log("listSocket error",e)
									return;
								}
							} else {
								// Ignore failing requests here, just log them for debug purposes.
								console.log("Missed file request: "+response);
							}

							// Stop listening after 30 seconds
							setTimeout(function() {
								self._deleteOwnDownloadRequest(requestId);
							}, listenTimeout);
						});

						console.log("Sending listFiles request to",peerId,":",fileQuery);
						Core.callRpcMethodLocal("Peers.sendMessage", [peerId, fileQuery]);
					}

					setTimeout(function() {
						if(listSocket.writeable) {
							listSocket.write("END\n");
						}
						self._stopFileListingServer(server);
					}, listenTimeout);
				},
				function(ip, port) {
					answerRequest(socket, Core.createJsonRpcResponse(moduleReqId, [ip,port]));
				});
			});
		},
	};

	return new FileTransfer();
}

module.exports = {getModule: getModule};
