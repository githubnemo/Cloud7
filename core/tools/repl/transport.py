import threading

from jsonrpc import *

class ServeThread(threading.Thread):
	def __init__(self, transport, handler, maxRequests):
		threading.Thread.__init__(self)

		self.transport = transport
		self.handler = handler
		self.maxRequests = maxRequests
		self._stop = False

		import socket
		(self.wakeupSender, self.wakeupReceiver) = socket.socketpair()

	def stop(self):
		self._stop = True
		print "stopping"
		self.wakeupSender.send("x")
		self.join()

	def run(self):
		import select

		transport = self.transport
		handler = self.handler

		if not self.transport.s:
			self.transport.connect()

		try:
			while not self._stop:
				sockets = select.select((self.transport.s, self.wakeupReceiver), (), ())[0]

				if not sockets or self.wakeupReceiver in sockets:
					break

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
