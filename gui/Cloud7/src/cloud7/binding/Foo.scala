package cloud7.binding

// The Base package for representing JSON-RPC 2.0 messages
import com.thetransactioncompany.jsonrpc2._;

// The JSON.simple package for JSON encoding/decoding (optional)
import org.json.simple._;

// For creating URLs
import java.net._;

import java.io._

object Foo {

  implicit def convertScalaListToJavaList(aList:List[String]) = java.util.Arrays.asList(aList.toArray: _*)

  
  def doStuff() {
  
    var serverURL:URL = null;

    try {
    	serverURL = new URL("http://localhost:8124");

    } catch {
      case e:MalformedURLException => println(e)
    }


    val method = "Core.echo"
    val requestId = 0
    val params = "foo" :: Nil
    val request = new JSONRPC2Request(method, params, requestId)

    println(request)
    
    var response:JSONRPC2Response = null


  }
  
  
  def main(args:Array[String]) {
    import rpc._
    
    Foo.doStuff
    
    val inFromUser = new BufferedReader( new InputStreamReader(System.in))
    
    
    while(true) {
      val sentence = inFromUser.readLine();
      Manager ! Send(sentence)
    }
    
    
  }

  
}