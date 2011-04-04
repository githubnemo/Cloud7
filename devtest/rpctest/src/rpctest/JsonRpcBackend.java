package rpctest;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringReader;
import java.net.Socket;
import java.net.UnknownHostException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

class InputReader extends Thread {

	protected JsonRpcBackend backend;
	protected BufferedReader source;
	
	public InputReader(JsonRpcBackend backend, BufferedReader source) {
		this.backend = backend;
		this.source = source;
	}
	
	public void run() {
		while(true) {
			String input;
			
			try {
				input = source.readLine();
			} catch (IOException e) {
				return;
			}
			
			System.out.println("Read: "+input);
			
			backend.socketInput(input);
		}
	}
	
}

public class JsonRpcBackend extends Thread {
	
	/*
	 * Warning:
	 * This code does not support JSON-RPC notifications (request ID == null).
	 * See sendRequest().
	 */
	
	protected String host;
	protected Integer port;
	protected JsonRpcRequestReceiver receiver;
	
	protected BlockingQueue<String> rawInput;			// input, input from InputReader
	protected BlockingQueue<String> responses;			// input, processed by sendRequest
	protected BlockingQueue<String> outgoingResponses; 	// output, responses returned by this.receiver
	protected BlockingQueue<String> outgoingCalls;		// output, calls to be written to socket

	protected Lock requestLock = new ReentrantLock();
	protected Lock conditionLock = new ReentrantLock();
	protected Condition worker = conditionLock.newCondition();
	
	public JsonRpcBackend(String host, int port) {
		this.host = host;
		this.port = port;
		
		rawInput = new LinkedBlockingQueue<String>();
		responses = new LinkedBlockingQueue<String>();
		outgoingResponses = new LinkedBlockingQueue<String>();
		outgoingCalls = new LinkedBlockingQueue<String>();
	}
	
	public synchronized void setRequestReceiver(JsonRpcRequestReceiver receiver) {
		this.receiver = receiver;
	}
	
	public String sendRequest(String requestData) {
		requestLock.lock();
		
		outgoingCalls.add(requestData);
		
		// Notify worker that there's work to do.
		try {
			conditionLock.lock();
			worker.signal();
		} finally {
			conditionLock.unlock();
		}
		
		try {
			return responses.take();
		} catch (InterruptedException e) {
			return null;
		} finally {
			requestLock.unlock();
		}
	}
	
	// Called from InputReader.
	public void socketInput(String input) {
		try {
			requestLock.lock();
			
			System.out.println("Added input to rawInput queue");
			rawInput.add(input);
			
			// Notify worker that there's work to do.
			try {
				conditionLock.lock();
				worker.signal();
			} finally {
				conditionLock.unlock();
			}
			
		} finally {
			requestLock.unlock();
		}
	}
	
	public void run() {
		Socket skt = null;
		
		try {
			skt = new Socket(this.host, this.port);
			
			PrintWriter outToServer = new PrintWriter(skt.getOutputStream(), true);
			BufferedReader inFromServer = new BufferedReader(new InputStreamReader(skt.getInputStream()));
			InputReader inputReader = new InputReader(this, inFromServer);
			
			inputReader.start();
			
			while(true) {
				
				for(String input : rawInput) {
			        JsonParser parser = new JsonParser();
					JsonObject resp = (JsonObject) parser.parse(new StringReader(input));
					
					System.out.println("input iter: "+input);
					
					if(resp.get("result") != null) {
						// Response
						responses.add(input);
						
					} else if(resp.get("method") != null) {
						// Request
						//
						// Process and attach the output to the outgoing queue so it
						// can be written soon.
						if(this.receiver != null) {
							this.outgoingResponses.add(this.receiver.receiveRequest(input));
						} else {
							System.out.println("Ignoring request: '"+input+"'");
						}
						
					} else {
						System.out.println("Ignoring ill-formed: '"+input+"'");
						continue;
					}
					
				}
		
				for(String output : outgoingResponses) {
					outToServer.println(output);
				}
				
				for(String output : outgoingCalls) {
					outToServer.println(output);
				}

				
				// Wait for more work.
				try {
					conditionLock.lock();
					worker.await();
				} finally {
					conditionLock.unlock();
				}
				
			}
		} catch (UnknownHostException e) {
			e.printStackTrace();
		} catch (IOException e) {
			e.printStackTrace();
		} catch (InterruptedException e) {
			e.printStackTrace();
		} finally {
			
			// Close socket if initialized.
			try {
				if(skt != null) {
					skt.close();
				}
			} catch (IOException e) {
				e.printStackTrace();
			}
		}
	}
	
}
