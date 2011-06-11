package rpc

import scala.actors._
import java.net._
import java.io._

case class Listener(clientSocket:Socket) extends Actor {

  def act = {
    this ! 'Start
    receive {
      case 'Start => listen
      case x => println("Wrong message received by Listener actor: " + x)
    }
  }
  
  def listen {

    val in = new BufferedReader(new InputStreamReader(clientSocket.getInputStream))
    
    loop {
      Manager ! Received(in.readLine)
    }
    
  }
  
}