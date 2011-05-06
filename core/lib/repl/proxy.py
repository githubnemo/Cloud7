import types


class Core(object):
	def __init__(self):
		pass


	def _feedProxy(self,proxy):
		self._proxy = proxy


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


