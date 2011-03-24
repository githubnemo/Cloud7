Very very early development.

core.js currently contains simple testing code of what our core might look like, if we decide to implement it using [Node.js](http://www.nodejs.org). You can use it like this:

	$ node core.js &
	$ nc 127.0.0.1 8124
	{ "method": "echo", "params": ["Hello JSON-RPC"], "id": 1}
	magie:Hello JSON-RPC 1