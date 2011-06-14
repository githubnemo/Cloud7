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
		Object[] options = { "OK", "CANCEL" };
		int ret = JOptionPane.showOptionDialog(null, "message", "title", JOptionPane.YES_NO_OPTION, JOptionPane.ERROR_MESSAGE, null, options, options[0]);
		return ret == 0;
	}
	
}
