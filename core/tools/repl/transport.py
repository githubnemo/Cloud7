import threading

from jsonrpc import *
import socket

class ServeThread(threading.Thread):
	def __init__(self, transport, handler, maxRequests):
		threading.Thread.__init__(self)

		self.transport = transport
		self.handler = handler
		self.maxRequests = maxRequests
		self._stop = False

	def stop(self):
		self._stop = True
		self.transport.s.shutdown(socket.SHUT_RD)
		print "stopping"
		self.join()

	def run(self):
		import select
		import socket

		transport = self.transport
		handler = self.handler

		if not self.transport.s:
			self.transport.connect()

		try:
			while not self._stop:
				sockets = select.select((self.transport.s,), (), ())[0]

				if not sockets:
					break

				# FIXME this could cause miss of data:
				# data available, can't dispatch, waiting for data,
				# dispatch now possible but hangs in waiting for data
				if transport.receiveLock.acquire(False) == False:
					continue # don't interfere here

				data = transport.s.recv(transport.limit)
				transport.log( "--> %s" % (repr(data)) )
				result = handler(data)
				if data is not None:
					transport.log( "<-- %s" % (repr(result)) )
					transport.s.send( result ) # XXX may interfer with other sends?
		finally:
			self.transport.close()


class TransportTcpIpSendReceive(TransportTcpIp):

	def __init__(self, *args, **kwargs):
		TransportTcpIp.__init__(self, *args, **kwargs)
		self.receiveLock = threading.Lock()

	def serve(self, handler, n=None):
		self.serverThread = ServeThread(self, handler, n)
		self.serverThread.start()

	def send(self, string):
		self.receiveLock.acquire()
		if string[-1] != "\n":
			string = string + "\n"
		TransportTcpIp.send(self, string)

	def recv(self):
		try:
			val = TransportTcpIp.recv(self)
		finally:
			self.receiveLock.release()
		return val

	def stop(self):
		if hasattr(self, "serverThread"):
			self.serverThread.stop()
			return True
		return False
