package rpctest;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.Socket;

import org.json.rpc.client.JsonRpcClientTransport;

public class TcpJsonRpcClientTransport implements JsonRpcClientTransport {

	protected String host;
	protected Integer port;
	protected Boolean async;
	
	public TcpJsonRpcClientTransport(String host, int port) {
		this.host = host;
		this.port = port;
		this.async = false;
	}
	
	public Boolean getAsync() {
		return async;
	}

	public void setAsync(Boolean async) {
		this.async = async;
	}

	@Override
	public String call(String requestData) throws Exception {
		
		String response = "";

		Socket skt = new Socket(this.host, this.port);
		
		System.out.println("Sending "+requestData);

		PrintWriter outToServer = new PrintWriter(skt.getOutputStream(), true);
		
		BufferedReader inFromServer = new BufferedReader(new InputStreamReader(skt.getInputStream()));

		outToServer.println(requestData);
		response = inFromServer.readLine();
		
		System.out.println("FROM SERVER: " + response);

		skt.close();
		
		return response;
	}

}
