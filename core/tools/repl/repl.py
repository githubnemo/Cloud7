#!/usr/bin/env python

import os
import sys
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


#def readline_completer(commands, text, state):
#	return [n for n in commands.keys() if n[0:len(text)] == text][state]


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
		"call":				c.cmdCall,
		"connect":			c.cmdConnect,
		"disconnect":		c.cmdDisconnect,
		"echo":				c.cmdEcho,
		"exit": 			c.cmdExit,
		"filelist":			c.cmdFileList,
		"fire":				c.cmdFireEvent,
		"help":				c.cmdHelp,
		"python":			c.cmdPython,
		"registerModule":	c.cmdRegisterModule
	}

	# Make command list available to help command
	commands["help"] = lambda *x,**y: c.cmdHelp(commands, *x, **y)

	#readline.set_completer(lambda *x,**kw: readline_completer(commands, *x, **kw))

	core = Core()

	# experimental: execute connect command on start
	c.cmdConnect(core, ["connect"] + sys.argv[1:2])

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
