package rpc

import scala.actors._
import java.net._
import java.io._

case class Writer(clientSocket:Socket) extends Actor {
  
  val out = new DataOutputStream(clientSocket.getOutputStream)

  def act {
    
    loop {
      react {
        case Send(x) => println("Sending message: " + x); out.writeBytes(x + "\n")
        case x => println("Unknown message received by Writer:" + x)
      }
    }
    
  }
  
     
}