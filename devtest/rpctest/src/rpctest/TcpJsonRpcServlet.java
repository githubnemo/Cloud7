package rpctest;


import java.io.PrintWriter;

import org.json.rpc.server.JsonRpcExecutor;
import org.json.rpc.server.JsonRpcServerTransport;

public class TcpJsonRpcServlet<E> implements JsonRpcServerTransport {

	protected JsonRpcExecutor executor;
	protected String requestData;
	protected PrintWriter writer;
	
	/**
	 * 
	 * @param exportName	How the thing we export shall be named
	 * @param toExport		Instance of the thing we want to export
	 * @param classes		Class(es) implementing the handler
	 */
	public TcpJsonRpcServlet(String exportName, E toExport, Class<E>... classes) {
		this.executor = new JsonRpcExecutor();
		
		executor.addHandler(exportName, toExport, classes);
	}
	
	public synchronized void handleRequest(String requestData, PrintWriter writer) {
		this.requestData = requestData;
		this.writer = writer;
		executor.execute(this);
		this.requestData = null;
		this.writer = null;
	}

	 
	@Override
	public String readRequest() throws Exception {
		return this.requestData;
	}

	@Override
	public void writeResponse(String responseData) throws Exception {
		this.writer.println(responseData);
	}
	
	
	
}
