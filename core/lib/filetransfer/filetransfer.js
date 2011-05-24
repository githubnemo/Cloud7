var net = require('net');
var crypto = require('crypto');

// Hash for a specific file in the network
function networkFileHash(networkName, fileHash) {
	var hasher = crypto.createHash('sha1');
	hasher.update(networkName);
	hasher.update(fileHash);
	return hasher.digest('hex');
}


function getModule(Core) {

	function FileTransfer() {

		this.peersModule = Core.getModule("Peers")

		this.peerRequestEventId = Core.bindToEvent("Peers.messageReceived", "FileTransfer", "_peersMessageReceived");
		this.peerResponseEventId = Core.bindToEvent("Peers.responseReceived", "FileTransfer", "_peersResponseReceived");
		this.joinEventId = Core.bindToEvent("Peers.joinedNetwork", "FileTransfer", "_networkJoined");

		this.shareFolder = "/home/nemo/Downloads/"


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
	}


	// A -> B [getFile(Foo)]
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
					// FileTransfer.getFile(fileName)
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
			// TODO publish files there
		},



		// Open a server which serves the requested file (if found)
		// and send the data to the client.
		_answerFileRequest: function(senderId, request) {
			// TODO
		},


		_answerListFilesRequest: function(senderId, request) {
			// TODO
		},


		// ------------------------------------
		// Unexported local methods
		// ------------------------------------


		// Serve the file given
		_startFileServer: function(fileLocation) {
			if(this.activeServers[fileLocation]) {
				return;
			}

			// TODO limit max open connections
			var server = net.createServer({}, function(con) {
				// TODO dump file into con
			});

			this.activeServers[fileLocation] = server;
		},


		_getPublicFiles: function() {
			// TODO
		},


		_startPublishingFileList: function(networkName) {
			self = this;

			function fileListRefresher() {
				// TODO iterate over public files, publish them in DHT
				/*Core.callRpcMethodLocal("Peers.getNetworkFileHash
				Core.callRpcMethodLocal("Peers.DHTput", hash, peerId); */
			}

			this.publishingNetworks[networkName] = setInterval(fileListRefresher, this.fileListTTL);

			fileListRefresher();
		},


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
		_downloadResposeHandler: function(id, ip, port) {
			var downloadData = this.ownDownloadRequests[id];

			// TODO download file from ip/port
		},


		// callback signature: callback(reqId)
		// 	reqId:Number
		//
		// Dispatch download request to the peer who claims to have the file.
		// The dispatched download's ID is passed to the callback so the caller
		// can track the download later on.
		_startDownloadFileFromPeer: function(networkName, peerId, fileName, destinationPath, callback) {
			var requestId = Core.generateRequestId(this.ownDownloadRequests);

			var downloadRequest = createJsonRpcRequest("FileTransfer.getFile", [fileName], requestId);

			this._registerOwnDownloadRequest(requestId, networkName, peerId, fileName, destinationPath, _downloadResposeHandler);

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

			Core.callRpcMethodLocal("Peers.joinedNetworks", [], function(response) {

				if(response.error !== undefined) {

					console.log("Error while retrieving joined networks", response);

					socket.write(Core.createJsonRpcError(
							moduleRequestId, "Error while retrieving joined networks: "+response.toString(),
							Core.json_errors.internal_error));

				} else {

					if(networkName in response.result) {
						// We joined the network so we can do things

						self._findFileInNetwork(networkName, fileName, function(peers) {
							if(peers.length == 0) {
								socket.write(Core.createJsonRpcError(
										moduleRequestId, "File "+fileName+" not found in network.", Core.json_errors.internal_error));
							} else {
								// Start download and wait for successful deploy.
								// Writes an ID for the download to the sender so he can track the download.
								//
								// TODO eventually choose random peer to balance load?
								//
								// TODO enable retry at other peer if download from this peer fails
								self._startDownloadFileFromPeer(networkName, peers[0], fileName, localPath, function(id) {
									socket.write(Core.createJsonRpcResponse(moduleRequestId, id));
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
		},
	};

	return new FileTransfer();
}

module.exports = {getModule: getModule};
