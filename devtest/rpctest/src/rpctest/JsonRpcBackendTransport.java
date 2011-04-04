package rpctest;

import org.json.rpc.client.JsonRpcClientTransport;

public class JsonRpcBackendTransport implements JsonRpcClientTransport {

	protected JsonRpcBackend backend;
	
	public JsonRpcBackendTransport(JsonRpcBackend backend) {
		this.backend = backend;
	}
	
	@Override
	public String call(String requestData) throws Exception {
		return backend.sendRequest(requestData);
	}

}
