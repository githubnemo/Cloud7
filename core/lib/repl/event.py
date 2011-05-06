

import threading

from jsonrpc import *


class ThreadedListener(threading.Thread):
	def __init__(self, transport):
		self.transport = transport
		self.stop = False
		self.server = None


	def run(self):
		self.server = Server( JsonRpc20(), self.transport )
		self.server.serve()


	def stop(self):
		self.stop = True


class Listener(object):
	def __init__(self, transport):
		self.transport = transport
		self.threadedListener = None


	def start(self):
		if self.threadedListener:
			return # already running
		self.threadedListener = ThreadedListener(self.transport)
		self.threadedListener.start()


	def registerHandler(self, *args, **kwargs):
		if self.threadedListener:
			self.threadedListener.server.register_function(*args,**kwargs)
			return True
		return False


	def stop(self):
		if not self.threadedListener:
			return # not running
		self.threadedListener.stop()

