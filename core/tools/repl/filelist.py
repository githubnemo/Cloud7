
from subprocess import Popen, PIPE
import socket

def show(ip, port):
	sock = socket.create_connection((ip,port), 5)

	proc = Popen(['less'], shell=True, stdin=PIPE)

	try:
		proc.stdin.write("Reading files from network...\n")
		proc.stdin.flush()
		while True:
			data = sock.recv(4096)
			if not data:
				break
			proc.stdin.write(data)
	except Exception as e:
		print "show: Error",e
	finally:
		proc.stdin.close()
		sock.close()

	proc.wait()

