package cloud7.binding

import javax.swing._
import rpc.Manager

import com.thetransactioncompany.jsonrpc2._;

import rpc._

object Peers {

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
    Manager ! Request("Peers.listNetworks", Nil, callback)
  }
  
}