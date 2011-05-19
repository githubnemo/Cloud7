import sys

from jsonrpc import *
from transport import TransportTcpIpSendReceive

def cmdBindToEvent(core, argv):
	if len(argv) < 3:
		print "Usage: bindToEvent <event name> <local name> <python code>"
		return

	def proxyHandler(*args, **kwargs):
		print "proxyHandler(bindEvent):",args,kwargs
		eval(" ".join(argv[3:]))

	succ = core._registerHandler(proxyHandler, name=argv[2])

	if not succ:
		print "Can't register. No listener?"
		return

	print "bindToEvent:", getattr(core, "Core.bindToEvent")(argv[1], argv[2])


def cmdCall(core, argv):
	if len(argv) < 2:
		print "Usage: call <fun name> [<params...>] where [] does not mean optional but a list"
		print "Example: call Core.echo ['This will be echoed']"
		return
	params = eval(" ".join(argv[2:]))
	print "call:",getattr(core,argv[1])(*params)


def cmdConnect(core, argv):
	port = len(argv) > 1 and int(argv[1]) or 8124

	transport = TransportTcpIpSendReceive(addr=("127.0.0.1", port), timeout=5.0, logfunc=log_file("transport.log"))
	proxy = ServerProxy( JsonRpc20(), transport )

	core._feedProxy(proxy, transport)

	print "Connection created. It *might* work now."


def cmdDisconnect(core, argv):
	print "stub"


def cmdEcho(core, argv):
	print getattr(core, "Core.echo")(" ".join(argv[1:]))


def cmdExit(core, argv):
	sys.exit(0)
	# not reached


def cmdFireEvent(core, argv):
	if len(argv) < 2:
		print "Usage: fireEvent <eventname> <data>"
	print "FIRE!11 >.<"


def cmdHelp(commands, core, argv):
	if len(argv) == 1:
		print "Available commands:", ", ".join(commands.keys())
		return

	cmd = argv[1]

	if not commands.has_key(cmd):
		print "Unknown command '%s'." % (cmd)
	else:
	 	doc = commands[cmd].__doc__
		if doc:
			print doc.strip()
		else:
		 	print "No help for command '%s' available." % (cmd)


def cmdRegisterModule(core, argv):
	if len(argv) < 3:
		print "Usage: registerModule <name> <methods...>\nExample: registerModule REPL foo bar baz"
		return
	print "registerModule:", getattr(core, "Core.registerModule")(argv[1], [argv[2:]])

