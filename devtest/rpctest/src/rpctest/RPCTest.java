package rpctest;

import org.json.rpc.client.JsonRpcInvoker;
import org.json.rpc.commons.JsonRpcRemoteException;
import org.json.rpc.server.JsonRpcExecutor;
import org.json.rpc.server.JsonRpcServerTransport;


/**
 * Interface which looks like the interface we want to call to
 * on the remote side.
 * 
 * @author nemo
 *
 */
interface Core {
	String echo(String input);
	boolean registerModule(String name, String[] methods);
}

interface RPCTestModule {
	String echo2(String input);
}

class RPCTestModuleImpl implements RPCTestModule {

	@Override
	public String echo2(String input) {
		return input+"2";
	}
	
}

class RequestReceiver<E> implements JsonRpcRequestReceiver, JsonRpcServerTransport {

	protected String request;
	protected String response;
	protected JsonRpcExecutor executor;
	
	public RequestReceiver(String exportName, E toExport, Class<E>... classes) {
		this.executor = new JsonRpcExecutor();
		
		executor.addHandler(exportName, toExport, classes);
	}
	
	@Override
	public synchronized String receiveRequest(String request) {
		this.request = request;
		
		try {
			executor.execute(this);
		} catch(JsonRpcRemoteException e) {
			e.printStackTrace();
		}
		
		System.out.println("Response from executor: "+this.response);
		
		return this.response;
	}

	@Override
	public String readRequest() throws Exception {
		return this.request;
	}

	@Override
	public void writeResponse(String responseData) throws Exception {
		this.response = responseData;
	}
}

public class RPCTest {
	

	/**
	 * @param args
	 */
	public static void main(String[] args) {

		RPCTestModule toExport = new RPCTestModuleImpl();
		
		JsonRpcBackend backend = new JsonRpcBackend("127.0.0.1", 8124);
		
		backend.setRequestReceiver(new RequestReceiver<RPCTestModule>("RPCTest", toExport, RPCTestModule.class));
		
		
		backend.start();
		
		JsonRpcBackendTransport transport = new JsonRpcBackendTransport(backend);
		
		
		
		
		JsonRpcInvoker invoker = new JsonRpcInvoker();
		
		// Create proxy class
		Core core = invoker.<Core>get(transport, "Core", Core.class);
		
		System.out.println("Sending 1. echo:");
		
		// Call core.echo
		String ret = core.echo("foo");
		System.out.println("Output expected foo: "+ret);
		
		
		System.out.println("Sending 2. echo:");
		
		ret = core.echo("bar");
		
		System.out.println("Output expected bar: "+ret);
		
		System.out.println("RPC Test 2");
		
		String[] foo = {"echo2"};
		boolean registered = core.registerModule("RPCTest", foo);
		
		System.out.println("Registered: "+registered);
		
		RPCTestModule rpcTestModule = invoker.<RPCTestModule>get(transport, "RPCTest", RPCTestModule.class);
		
		String echo2 = rpcTestModule.echo2("RPCTest!");
		
		System.out.println("RPCTest echo2: "+echo2);
		
		
		backend.stopHandling();
		
		/*
		TcpJsonRpcClientTransport transport = new TcpJsonRpcClientTransport("127.0.0.1", 8124);

		JsonRpcInvoker invoker = new JsonRpcInvoker();
		// Create proxy class
		Core core = invoker.<Core>get(transport, "Core", Core.class);

		
		System.out.println("Sending 1. echo:");
		
		// Call core.echo
		String ret = core.echo("foo");
		System.out.println(ret);
		
		
		System.out.println("Sending 2. echo:");
		
		ret = core.echo("bar");
		
		System.out.println(ret);
		*/
	}

}
