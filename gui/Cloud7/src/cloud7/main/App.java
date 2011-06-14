/*
 * App.java
 */

package cloud7.main;

import javax.swing.JOptionPane;

import cloud7.binding.*;

import org.jdesktop.application.Application;
import org.jdesktop.application.SingleFrameApplication;

/**
 * The main class of the application.
 */
public class App extends SingleFrameApplication {

    /**
     * At startup create and show the main frame of the application.
     */
    @Override protected void startup() {
        show(new View(this));
        
    }

    /**
     * This method is to initialize the specified window by injecting resources.
     * Windows shown in our application come fully initialized from the GUI
     * builder, so this additional configuration is not needed.
     */
    @Override protected void configureWindow(java.awt.Window root) {
    }

    /**
     * A convenient static getter for the application instance.
     * @return the instance of App
     */
    public static App getApplication() {
        return Application.getInstance(App.class);
    }

    /**
     * Main method launching the application.
     */
    public static void main(String[] args) {
    	// Foo.doStuff();
    	// Initialize RPC Manager by trying to send a test message to the core.
    	// If the following line is marked as an error, this is a bug in your IDE!
    	rpc.Manager.initializeConnetionAndShowApp(args);
    }
    
    public static void doLaunch(String[] args) {
    	launch(App.class, args);
    }
}
