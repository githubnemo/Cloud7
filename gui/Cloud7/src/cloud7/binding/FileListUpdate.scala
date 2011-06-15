package cloud7.binding

import javax.swing._
import javax.swing.table._
import rpc.Manager
import com.thetransactioncompany.jsonrpc2._;
import rpc._
import java.net._
import java.io._
import scala.actors._
import scala.annotation.tailrec

sealed case class FileListResponse(r:JSONRPC2Response)

final case class TableUpdaterActor(table:JTable) extends Actor {
  
   /**
   * Implicit which automatically converts Scala lists to Java lists.
   */
  implicit def listTojavaList[T : Manifest](aList:List[T]) = java.util.Arrays.asList(aList.toArray: _*)
  
  this.start
  
  def act = {
    
    val model = new DefaultTableModel()
    table.setModel(model)
    
    model.addColumn("Name")
    model.addColumn("Size")
    
    loop {
      react {
        case FileListResponse(r) => r.getResult match {
          case x:org.json.simple.JSONArray => 
          	for(i <- x.toArray) i match {
          	  case y:org.json.simple.JSONObject => println(y)
          	    
          	  
          	  val foo:Array[AnyRef] = Array( y.get("file").asInstanceOf[AnyRef],
          			  						 y.get("size").asInstanceOf[AnyRef]
          	  							)
          	  
          	  model.addRow(foo)
          	  table.revalidate

          	  
          	  
          	  case _ => println("FileListResponse must be broken in TableUpdaterActor")
          	}
          	
          case x => println("Unexpected response result in TableUpdaterActor of type: " + x.getClass())
        }
        case _ =>
          sender ! 'Yes
          exit()
      }
    }
    
  }
  
}

final case class FileListUpdate( address:String, port:Long, table:JTable, busyTimer:Timer ) extends Actor {
  
  var listSocket:Socket = _
  
  this.start
  
  def act {
    busyTimer.start
    initializeConnection
    val in = new BufferedReader(new InputStreamReader(listSocket.getInputStream))
    println("Created FileListUpdate, now listening")
    handleIncomingData(in, TableUpdaterActor(table))
  }
  
  /**
   * This method contains the actual loop this actor runs, which reads from the file listing 
   * socket and passes the received lists to the "tableUpdater" Actor, which in turn extracts
   * the necessary information and updates the GUI table with the data.
   * When the "END" is reached, this Actor asks the "tableUpdater" if it has finished all its updating,
   * and when a response is received, this actor exits
   */
  def handleIncomingData(in:BufferedReader, tableUpdater:Actor) = loop {
    var line = in.readLine()
    
    // Ask tableUpdater to close and
    // exit when all work is done.
    if(line.equals("END")) {
      println("Closing FileListUpdate Actor")
      tableUpdater ! 'Exit
      react {
        case _ => println("Response from table updater received, exiting"); busyTimer.stop; exit()
      }
    }
    
    try {
      val response = JSONRPC2Response.parse("{\"jsonrpc\":\"2.0\",\"result\": " + line + ", \"id\": 1}")
      tableUpdater ! FileListResponse(response)
    } catch {
     case e:JSONRPC2ParseException => println("Could not parse JSON-RPC response: " + e.getMessage)
    }
  }
  
  
  /**
   * Tries to initialize the connection to the FileListing Socket and
   * exits the application if it could not be established.
   */
  @tailrec
  def initializeConnection:Unit = {
     val error = (try {
    	listSocket = new Socket()
    	listSocket.connect(new InetSocketAddress(address, port.toInt), 1000)
    	false
    } catch {
      case _ =>
        val ret = cloud7.main.ModalDialogs.fileFetchingFailed();
        if(ret == false) System.exit(1)
        true
    })
		
    if(error) initializeConnection
  }
  
}