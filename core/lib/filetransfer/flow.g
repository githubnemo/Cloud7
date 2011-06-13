
digraph foo {

	"event loop" -> "publish files for existing networks" [label="module start"]

	"event loop" -> "publish files for joined network" [label="network joined"]

	"event loop" -> "stop publishing files for network left" [label="network left"]




	"listFiles(network)" -> "socket opened" [label="open socket"]
	"socket opened" -> "listFiles(network)" [label="return ip/port to requestor"]

	"listFiles(network)" -> "ask all peers of network"
	"ask all peers of network" -> "write answer to opened socket" [label="peer answers"]

	"listFiles(network)" -> "listFiles(network)" [label="close socket after 30 seconds"]




	"retrieveFile(network,file,destination)" -> "peers for file found" [label="query file in DHT"]

	"peers for file found" -> "peer opened socket" [label="FileTransfer.get(file)"]
	"peers for file found" -> "retrieveFile(network,file,destination)" [label="return download id to requestor"]

	"peer opened socket" -> "got socket data" [label="answer with socket address/port"]

	"got socket data" -> "downloaded file" [label="download file from socket"]

}

