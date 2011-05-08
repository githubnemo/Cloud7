

import threading

from jsonrpc import *


class Listener(object):
	def __init__(self, transport):
		self.transport = transport
		self.server = None


	def start(self):
		if self.server:
			return False
		self.server = Server( JsonRpc20(), self.transport )
		self.server.serve(None)


	def registerHandler(self, *args, **kwargs):
		if self.server:
			self.server.register_function(*args,**kwargs)
			return True
		return False


	def stop(self):
		self.transport.stop()

