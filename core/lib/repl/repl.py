#!/usr/bin/env python

import os
import readline

# Local imports
from proxy import Core


def process_input(core, commandMap, data):
	argv = data.split(" ")

	if len(argv) == 0:
		print "No command given?"
		return

	if commandMap.has_key(argv[0]):
		commandMap[argv[0]](core, argv)
	else:
		print "Unknown command '%s'." % (argv[0])


def exceptionHandler(exception):
	import traceback
	print "Something went wrong: %s\n%s" % (exception,traceback.format_exc(exception))


def main():
	readline.set_history_length(20)

	histfile = os.path.join(os.path.expanduser("~"), ".c7hist")

	try:
		readline.read_history_file(histfile)
	except IOError:
		pass

	import commands as c

	commands = {
		"bindToEvent":		c.cmdBindToEvent,
		"connect":			c.cmdConnect,
		"disconnect":		c.cmdDisconnect,
		"echo":				c.cmdEcho,
		"exit": 			c.cmdExit,
		"fire":				c.cmdFireEvent,
		"help":				c.cmdHelp,
		"registerModule":	c.cmdRegisterModule
	}

	# Make command list available to help command
	commands["help"] = lambda *x,**y: c.cmdHelp(commands, *x, **y)

	core = Core()

	# experimental: execute connect command on start
	c.cmdConnect(core, [])

	while True:
		try:
			input = raw_input("Cloud7> ")

			process_input(core, commands, input)

		except EOFError:
			break # we're done, exit gracefully

		except Exception as e:
			exceptionHandler(e)
			continue

	core._stop()

	import atexit
	atexit.register(readline.write_history_file, histfile)


if __name__ == "__main__":
	main()
