package cloud7.binding

import javax.swing._
import rpc.Manager

import com.thetransactioncompany.jsonrpc2._;

import rpc._

object Peers {

  def listNetworks(table:JTable) {
    val callback = (r:JSONRPC2Response) => {
      
      println(r)
      
      val a:Array[Array[AnyRef]] = 
        Array (
          Array("Loaded")
        )
        
      val b:Array[AnyRef] = Array("Network")
      
      table.setModel(new javax.swing.table.DefaultTableModel(a, b));
    }
    
    //Manager ! Request("Peers.listNetworks", "foo" :: 1000 :: Nil, callback)
    Manager ! Request("Peers.listNetworks", Nil, callback)
  }
  
}