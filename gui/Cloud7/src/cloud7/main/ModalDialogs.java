package cloud7.main;

import javax.swing.JOptionPane;

public final class ModalDialogs {

	/**
	 * Shows a modal dialog when the connection to the core failed,
	 * asking if the connection attempt should be retried.
	 * Returns true if it should, false otherwise.
	 * @return 
	 */
	public static boolean connectRetry() {
		Object[] options = { "Retry", "Exit" };
		int ret = JOptionPane.showOptionDialog(null, "Es konnte keine Verbindung zum Cloud7-Kern aufgebaut werden.", "Verbindung fehlgeschlagen", JOptionPane.YES_NO_OPTION, JOptionPane.ERROR_MESSAGE, null, options, options[0]);
		return ret == 0;
	}
	
	
	
	/**
	 * Shows a modal dialog if joining a network failed.
	 */
	public static void joinFailed(java.awt.Component parent) {
		Object[] options = { "Ok" };
		int ret = JOptionPane.showOptionDialog(parent, "Dem Netzwerk konnte nicht beigetreten werden.", "Beitreten fehlgeschlagen", JOptionPane.YES_NO_OPTION, JOptionPane.ERROR_MESSAGE, null, options, options[0]);
	}
	
	
	
	public static boolean fileFetchingFailed() {
		Object[] options = { "Retry", "Exit" };
		int ret = JOptionPane.showOptionDialog(null, "Die im Netzwerk verfügbaren Dateien konnten nicht abgefragt werden", "File listing fehlgeschlagen", JOptionPane.YES_NO_OPTION, JOptionPane.ERROR_MESSAGE, null, options, options[0]);
		return ret == 0;
	}
	
	
}
