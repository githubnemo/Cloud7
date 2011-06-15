package cloud7.binding

import javax.swing._
import rpc.Manager

import com.thetransactioncompany.jsonrpc2._;

import rpc._

/**
 * Implements the Peer API found at
 * https://github.com/x3ro/Cloud7/wiki/Schnittstellen
 */

object Peers {

  var networkName:String = _
  
  /**
   * listNetworks() => List[String]
   */
  def listNetworks(table:JTable) {
    
    println("listNetworks")
    // Callback which extracts found networks from response and
    // updates the networks list JTable with them
    val callback = (r:JSONRPC2Response) => {
      
      var l:List[Array[AnyRef]] = Nil
      r.getResult match {
        case x:org.json.simple.JSONArray => {
          
          for(i <- x.toArray) {
        	l = Array(i) :: l 
          }
          
        }
        case _ => println("Unexpected response in Peers.listNetworks callback")
      }
      
      val a:Array[Array[AnyRef]] =  l.toArray
      val b:Array[AnyRef] = Array("Network")
      
      table.setModel(new javax.swing.table.DefaultTableModel(a, b));
    }
    
    //Manager ! Request("Peers.listNetworks", "foo" :: 1000 :: Nil, callback)
    
    // Send a listNetworks request which does not take arguments
    Manager ! Request("Peers.listNetworks", Nil, callback)
  }
  
  
  
  /**
   * joinNetwork(String: networkName) => True or Error
   */
  def joinNetwork(name:String, loginDialog:javax.swing.JDialog) {
    println("joinNetwork")
    val callback = (r:JSONRPC2Response) => {
      r.getResult() match {
        case x:java.lang.Boolean if x == false => cloud7.main.ModalDialogs.joinFailed(loginDialog)
        case x:java.lang.Boolean => networkName = name;loginDialog.dispose()
        case _ => println("Unexpected result in joinNetwork response")
      }
    }
    
    val r = new Request("Peers.joinNetwork", name :: Nil, callback) with Timeout
    r.setTimeout(10000)
    r.setTimeoutCallback( () => {
      cloud7.main.ModalDialogs.joinFailed(loginDialog)
    } )
    
    Manager ! r
  }
  
  
  /**
   * leaveNetwork(String: networkName)
   */
  def leaveNetwork(name:String) {
    val callback = (r:JSONRPC2Response) => {
      
    }
    
    Manager ! Request("Peers.joinNetwork", name :: Nil, callback);
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
}