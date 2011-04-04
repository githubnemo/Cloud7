package rpctest;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringReader;
import java.net.Socket;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
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
	protected boolean stop = false;
	
	public InputReader(JsonRpcBackend backend, BufferedReader source) {
		this.backend = backend;
		this.source = source;
	}
	
	public synchronized void stopHandling() {
		this.stop = true;
		this.notify();
	}
	
	public void run() {
		while(!this.stop) {
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
	 * This code does not support JSON-RPC 1.0 notifications (request ID == null).
	 * See sendRequest().
	 */
	
	protected boolean stop = false;
	
	protected String host;
	protected Integer port;
	protected JsonRpcRequestReceiver receiver;
	
	protected BlockingQueue<String> rawInput;			// input, input from InputReader
	protected BlockingQueue<String> responses;			// input, processed by sendRequest
	protected BlockingQueue<String> outgoingResponses; 	// output, responses returned by this.receiver
	protected BlockingQueue<String> outgoingCalls;		// output, calls to be written to socket

	protected Lock requestLock = new ReentrantLock();
	protected Lock inputLock = new ReentrantLock();
	protected Lock conditionLock = new ReentrantLock();
	protected boolean shouldBlock = true;				// Indicates whether the main loop should block or not. 
														// Used as buffer if the main loop does not wait but a
														// signal from the worker condition is raised.
	protected Condition worker = conditionLock.newCondition();
	
	public JsonRpcBackend(String host, int port) {
		this.host = host;
		this.port = port;
		
		rawInput = new LinkedBlockingQueue<String>();
		responses = new LinkedBlockingQueue<String>();
		outgoingResponses = new LinkedBlockingQueue<String>();
		outgoingCalls = new LinkedBlockingQueue<String>();
	}
	
	/**
	 * Sets the object responsible for handling incoming RPC requests.
	 * 
	 * @param receiver
	 */
	public synchronized void setRequestReceiver(JsonRpcRequestReceiver receiver) {
		this.receiver = receiver;
	}
	
	/**
	 * Send a RPC request to the other end of the connection.
	 * 
	 * Waits for result synchronously.
	 * 
	 * @param requestData	The RPC request to make.
	 * @return String 		Result of the call.
	 */
	public String sendRequest(String requestData) {
		
		if(this.stop) {
			throw new RuntimeException("Called sendRequest on stopped JsonRpcBackend");
		}
		
		try {
			requestLock.lock();
	
			outgoingCalls.add(requestData);
			System.out.println("Put request data in queue: "+requestData);
		} finally {
			requestLock.unlock();
		}
		
		// Notify worker that there's work to do.
		try {
			conditionLock.lock();
			this.shouldBlock = false;
			worker.signal();
		} finally {
			conditionLock.unlock();
		}
		
		System.out.println("request notification done.");
		
		try {
			return responses.take();
		} catch (InterruptedException e) {
			return null;
		}
	}
	
	/**
	 * Incoming data is feed here.
	 * 
	 * @param input		Data incoming from the other end.
	 */
	public void socketInput(String input) {
		System.out.println("In socketInput:" +input);
		
		if(input == null) {
			// TODO handle this more specifically?
			this.stopHandling();
			throw new RuntimeException("Input error: input is null.");
		}
		
		try {
			inputLock.lock();
			
			rawInput.add(input);
			System.out.println("Added input to rawInput queue");
		} finally {
			inputLock.unlock();
		}
			
		// Notify worker that there's work to do.
		try {
			conditionLock.lock();
			this.shouldBlock = false;
			worker.signal();
			System.out.println("socketInput: signaled worked");
		} finally {
			conditionLock.unlock();
		}

	}
	
	/**
	 * Stops the backend handler from working.
	 */
	public void stopHandling() {
		this.stop = true;
		try {
			conditionLock.lock();
			this.shouldBlock = false;
			worker.signal();
		} finally {
			conditionLock.unlock();
		}
	}
	
	/**
	 * Iterate over the input strings and handle them
	 * - responses: Add to response queue
	 * - requests: Hand over to request receiver (this.receiver) and wait for output
	 * 
	 * Iterate over the output strings and handle them
	 * - print both to socket
	 * 
	 * If new data is received or a new request was made, this
	 * thread is waked up.
	 */
	public void run() {
		Socket skt = null;
		InputReader inputReader = null;
		
		try {
			skt = new Socket(this.host, this.port);
			
			PrintWriter outToServer = new PrintWriter(skt.getOutputStream(), true);
			BufferedReader inFromServer = new BufferedReader(new InputStreamReader(skt.getInputStream()));
			
			// Initialize/Start socket reader
			inputReader = new InputReader(this, inFromServer);
			
			inputReader.start();
			
			while(!this.stop) {
				
				List<String> inputs = new ArrayList<String>();
				List<String> outResponses = new ArrayList<String>();
				List<String> outCalls = new ArrayList<String>();

				try {
					inputLock.lock();

					System.out.println("run: fetching inputs");
					rawInput.drainTo(inputs);
					
					for(String input : inputs) {
				        JsonParser parser = new JsonParser();
						JsonObject resp = (JsonObject) parser.parse(new StringReader(input));
						
						System.out.println("input iter: "+input);
						
						if(resp.get("result") != null || resp.get("error") != null) {
							// Response
							//
							// Responses have either a result or a message field.
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
				
				} finally {
					inputLock.unlock();
				}
		
				
				outgoingResponses.drainTo(outResponses);
				
				for(String output : outResponses) {
					outToServer.println(output);
				}
				
				try {
					requestLock.lock();
					System.out.println("Processing output calls");
					outgoingCalls.drainTo(outCalls);
					
					for(String output : outCalls) {
						outToServer.println(output);
					}
				} finally {
					requestLock.unlock();
				}

				

				// Wait for more work.
				try {
					conditionLock.lock();
					
					while(shouldBlock == true) { // While against spurious wakeup.
						// We have to wait for a signal to arrive.
						// Either from sendRequest() or from socketInput().
						worker.await();
					}
					
					// In the next round we have to block by default.
					this.shouldBlock = true;
					
					System.out.println("Another round for fun and profit.");
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
			
			// Wake up all threads that wait for results 
			// in sendRequest. There won't be any.
			// TODO revise
			responses.add("{\"error\":{\"code\":-1,\"message\":\"Backend stopped.\"},\"id\":null}");
			
			if(inputReader != null) {
				inputReader.stopHandling();
			}
			
			
		}
	}
	
}
