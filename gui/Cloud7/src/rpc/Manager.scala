package rpc

import scala.actors._
import java.net._
import java.io._

import scala.collection.mutable._

import com.thetransactioncompany.jsonrpc2._

import scala.annotation.tailrec

import javax.swing._


// Messages




/**
 * Send a Request to the Cloud7 core, passing the specified parameters.
 * Once an answer for the request arrives, the given callback will be executed.
 * This may happen multiple times, as a single request may have multiple answers.
 */
case class Request (
		method:String, 
		params:List[Any], 
		callback: JSONRPC2Response => Unit
)


/**
 * If you mix in this trait, you have an additional timeoutCallback which executes if
 * no response is received within the given timeout (in milliseconds).
 * Note that if a single response for the request
 * is received, the timeoutCallback will never be called again,
 * that is, the timeoutCallback will NOT be executed if a response is received and the
 * time specified in timeout elapses once more.
 * Also note that, before the timeoutCallback is executed, the regular callback will be removed
 * from the callback list, which means that later responses with that event id will be 
 * discarded.
 */
trait Timeout {
  var timeout = 10
  var timeoutCallback = () => ()
  
  def setTimeout(t:Int) = { timeout = t; this }
  def setTimeoutCallback(c: () => Unit) = { timeoutCallback = c; this }
}
					

/**
 * Basic message for string passing between the Listener Actor 
 * and the Manager.
 */
case class Received(msg:String)

/**
 * Basic message for string passing between the Manager and 
 * * the Writer Actor.
 */
case class Send(msg:String)




object Manager extends Actor {

  /*
   * Constructor code
   */
  
  Manager.start
  
  /**
   * The TCP Socket on which we commuicate with the Cloud7 core
   */
  var clientSocket:Socket = _
  
  /**
   * Reference to the Writer Actor.
   */
  var writer:Actor = _
  
  /**
   * Map which maps incoming request ids to the callbacks which shall be executed
   * to process them. If no callback is found for a given request id, the request 
   * is discarded.
   */
  var callbacks:Map[Long, JSONRPC2Response => Unit] = new HashMap[Long, JSONRPC2Response => Unit]()
  
  /**
   * Map which maps request ids to timeout callback actors (there is an actor for every
   * timeout request, which is automatically deleted as soon as it times out or a response
   * for the request id in question arrives.
   */
  var timeoutActors:Map[Long, Actor] = new HashMap[Long, Actor]()
  
  /**
   * Request id of the last JSONRequest sent out.
   */
  var lastId = 0
  
  
  /* 
   * Initialization
   */

  /**
   * The managers act method initializes the connection and spawns the needed workers
   * which are currently:
   * 	- Listener Actor
   * 	- Writer Actor
   * 
   * This Actor is automatically started by its constructor, which in turn is automatically
   * executed the first time the Manager object is used.
   */
  def act = {
   
    
    react {
      // Only start responding to messages once the connection has been started.
      case 'InitializedConnection =>
        spawnWorkers
        loop {
          react {
            case x:Request => sendMessage(x)
            case Received(x) => parseResponse(x)
            case x => println("Unexpected message in Manager: " + x)
          }
        }
        
    }
    
  }
  
  /**
   * Does what it says.
   * Initialize connection is called (until it succeeds, see initializeConnection
   * which is recursive.
   * If successful, the GUI is launched.
   */
  def initializeConnetionAndShowApp(args:Array[String]) {
    initializeConnection
    cloud7.main.App.doLaunch(args);
    this ! 'InitializedConnection
  }
  
  /**
   * Creates the client socket.
   * Shows a modal dialog (See cloud7.main.ModalDialogs class) if
   * the connection attempt failed. If connection attempt is not retried,
   * just exists.
   */
  @tailrec
  def initializeConnection:Unit = {
    
	val error = (try {
	  clientSocket = new Socket()
	  clientSocket.connect(new InetSocketAddress("localhost", 8124), 1000)
	  false
	} catch {
	  // TODO: Maybe more specific exception handling? Socket throws
	  // the following extension
	  //case e:java.net.SocketTimeoutException => // Do Stuff
	  case _ =>
	    val ret = cloud7.main.ModalDialogs.connectRetry()
	    if(ret == false) System.exit(1)
	    true
	})
	
	if(error) initializeConnection
	
  }
  
  /**
   * Spawn Worker Actors which are managed by this very class.
   */
  def spawnWorkers = {
	Listener(clientSocket).start
    writer = Writer(clientSocket).start
  }
  
 
  /**
   * Implicit which automatically converts Scala lists to Java lists.
   */
  implicit def listTojavaList[T : Manifest](aList:List[T]) = java.util.Arrays.asList(aList.toArray: _*)
  
  

  
  
  /*
   * Sending messages
   */
  
  
  /**
   * TODO: Document
   */
  def sendMessage(req:Request) {
    val id = lastId + 1
    lastId = id
    
    val request = new JSONRPC2Request(req.method, req.params, id)
    
    callbacks += ((id, req.callback))
    
    writer ! Send(request.toString)
    
    // If the Timeout trait is mixed in, also register the timeout.
    // After that we're done.
    req match {
      case x:Timeout => registerTimeout(id, x)
      case _ => /* Do nothing */
    }
  }
  
  /**
   * Registers a timeout which fires after the set amount of milliseconds
   * (see the Timeout trait to see how they're set). The trait is used as 
   * a mixin for request.
   */
  def registerTimeout(requestId:Int, x:Timeout) {
    println("registering timeout for request id i = " + requestId)
    val actor = Actor.actor {
      var enabled = true
       Actor.self.reactWithin(x.timeout) {
        case TIMEOUT =>
          callbacks.remove(requestId)
          timeoutActors.remove(requestId)
          if(enabled) {
        	x.timeoutCallback()
          }
        
        case 'Disable => 
          println("Disabled actor for Id " + requestId + " before timeout expired");
          enabled = false
        

      }
    }.start
    timeoutActors.put(requestId, actor)
  }
  
  
  /*
   * Response Handling
   */
  
  /**
   * Tries to parse a given response string to convert it to a JSONRPC2Response
   * class. If this fails, a message is shown on the console.
   * TODO: Better error handling?
   */
  def parseResponse(msg:String) {
    
    try {
      handleResponse( JSONRPC2Response.parse(msg) )
    } catch {
      case e:JSONRPC2ParseException => println("Could not parse JSON-RPC response: " + e.getMessage)
    }
    
  }
  
  /**
   * Does the actual response handling, that is, the execution of the
   * correct callback (if there is one), with the parsed response as
   * its only parameter.
   * TODO: Remove/improve debugging output stuff
   */
  def handleResponse(response:JSONRPC2Response) {
    
    if (response.indicatesSuccess()) {
      System.out.println("The request succeeded :");

      System.out.println("\tresult : " + response.getResult());
      System.out.println("\tid     : " + response.getID());
      
      val id = response.getID().toString().toLong
      
      timeoutActors.get(id).map { b => b ! 'Disable }      
      callbacks.get(id).map { b => b(response) }
      
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