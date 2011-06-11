package rpc

import scala.actors._
import java.net._
import java.io._

import scala.collection.mutable._

import com.thetransactioncompany.jsonrpc2._;


// Messages
case class Received(msg:String)
case class Request(method:String, params:List[Any], callback: JSONRPC2Response => Unit)
case class Send(msg:String)




object Manager extends Actor {
	
  Manager.start
  
  var clientSocket:Socket = _
  var writer:Actor = _
  
  var callbacks:Map[Any, JSONRPC2Response => Unit] = new HashMap[Any, JSONRPC2Response => Unit]()
  
  var lastId = 0
  
  def act = {
    initializeConnection
    spawnWorkers
    
    loop {
      react {
        case x:Request => sendMessage(x)
        case Received(x) => parseResponse(x)
        case x => println("Unexpected message in Manager: " + x)
      }
    }
    
  }
  
  
  /* 
   * Initialization
   */
  
  def initializeConnection = {
	clientSocket = new Socket("localhost", 8124)
  }
  
  def spawnWorkers = {
	Listener(clientSocket).start
    writer = Writer(clientSocket).start
  }
  
  
  /*
   * Sending messages
   */
  implicit def listTojavaList[T : Manifest](aList:List[T]) = java.util.Arrays.asList(aList.toArray: _*)
  
  def sendMessage(x:Request) {
    val id = lastId + 1
    lastId = id
    
    val request = new JSONRPC2Request(x.method, x.params, id)
    
    callbacks += ((id, x.callback))
    
    writer ! Send(request.toString)
  }
  
  
  /*
   * Response Handling
   */
  
  def parseResponse(msg:String) {
    
    try {
      handleResponse( JSONRPC2Response.parse(msg) )
    } catch {
      case e:JSONRPC2ParseException => println("Could not parse JSON-RPC response: " + e.getMessage)
    }
    
  }
  
  def handleResponse(response:JSONRPC2Response) {
    
    if (response.indicatesSuccess()) {
      System.out.println("The request succeeded :");

      System.out.println("\tresult : " + response.getResult());
      System.out.println("\tid     : " + response.getID());
 
      callbacks(response.getID)(response)
      
    }
    else {
      System.out.println("The request failed :");
      val err = response.getError();

      System.out.println("\terror.code    : " + err.getCode());
      System.out.println("\terror.message : " + err.getMessage());
      System.out.println("\terror.data    : " + err.getData());
    }
    
  }
  
}