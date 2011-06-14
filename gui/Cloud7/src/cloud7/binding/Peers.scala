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

  /**
   * listNetworks() => List[String]
   */
  def listNetworks(table:JTable) {
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
    val f = new Request("Peers.listNetworks", Nil, callback) with Timeout
    f.setTimeout(5000)
    f.setTimeoutCallback( () => {
      println("timed out")
    } )
    
    Manager !  f
  }
  
  
  
  /**
   * joinNetwork(String: networkName) => True or Error
   * TODO: Add additional parameter which we interact with
   * in the callback.
   */
  def joinNetwork(name:String) {
    
    val callback = (r:JSONRPC2Response) => {
      
    }
    
    Manager ! Request("Peers.joinNetwork", name :: Nil, callback);
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