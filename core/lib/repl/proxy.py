import types


import event


class Core(object):
	def __init__(self):
		self._proxy = None
		self._transport = None
		self._listener = None


	def _feedProxy(self,proxy,transport):
		self._proxy = proxy

		if self._listener:
			self._listener.stop()

		self._transport = transport
		self._listener = event.Listener(transport)


	def _registerHandler(self, *args, **kwargs):
		if self._listener:
			return self._listener.registerHandler(*args,**kwargs)
		return False


	def _decorate(func):
		def coreCallProxy(*args, **kwargs):
			print "MEH"
			try:
				return func(*args,**kwargs)
			except RPCTransportError,e:
				print "Something went wrong:", e
		return coreCallProxy


	def __getattr__(self, attr):
		if attr[0] == "_":
			return object.getattribute(self,attr)
		else:
			attr = getattr(self._proxy,attr)

			if isinstance(attr, types.FunctionType):
				return _decorate(attr)
			else:
				return attr


