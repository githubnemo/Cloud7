package cloud7.binding

import javax.swing._
import rpc.Manager
import com.thetransactioncompany.jsonrpc2._;
import rpc._
import java.net._
import java.io._
import scala.actors._


object FileTransfer {

  def listFiles(table:JTable, busyTimer:Timer) {

    val callback:JSONRPC2Response => Unit = (r:JSONRPC2Response) => {
      r.getResult() match {
        case x:org.json.simple.JSONArray =>
          val arr = x.toArray
          FileListUpdate(arr(0).asInstanceOf[String], arr(1).asInstanceOf[Long], table, busyTimer)

        case _ => println("Unexpected response result in FileTransfer.listFiles")
      }

    }
    
    val r = new Request("FileTransfer.listFiles", Peers.networkName :: Nil, callback) with Timeout
    r.setTimeout(10000)
    r.setTimeoutCallback( () => {
      busyTimer.stop
    } )
    
    
    Manager ! r
  }
  
}