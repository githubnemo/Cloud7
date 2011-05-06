import sys

from jsonrpc import *


def cmdConnect(core, argv):
	port = len(argv) > 1 and int(argv[1]) or 8124

	proxy = ServerProxy( JsonRpc20(), TransportTcpIp(addr=("127.0.0.1",port)) )
	core._feedProxy(proxy)

	print "Connection created. It *might* work now."


def cmdDisconnect(core, argv):
	print "stub"


def cmdEcho(core, argv):
	print getattr(core, "Core.echo")(" ".join(argv[1:]))


def cmdFireEvent(core, argv):
	if len(argv) < 2:
		print "Usage: fireEvent <eventname> <data>"
	print "FIRE!11 >.<"


def cmdExit(core, argv):
	sys.exit(0)
	# not reached
