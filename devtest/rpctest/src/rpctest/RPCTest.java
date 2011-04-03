package rpctest;

import org.json.rpc.client.JsonRpcInvoker;


/**
 * Interface which looks like the interface we want to call to
 * on the remote side.
 * 
 * @author nemo
 *
 */
interface Core {
	String echo(String input);
}

public class RPCTest {
	

	/**
	 * @param args
	 */
	public static void main(String[] args) {

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
	}

}
