#!/bin/sh

if [ -e "start_config" ]; then
	echo "Reading configuration"
	. ./start_config
fi

no_nodejs() {
	echo "node.js not found. Configure \$NODE_ROOT in file start_config or fix your PATH"
	exit 1
}

if [ -z "$NODE_ROOT" ] && ! which node >/dev/null; then
	no_nodejs
elif [ -z "$NODE_ROOT" ]; then
	NODE_ROOT=$(dirname $(which node))
fi

# Check for existance of executable
if [ -z "$NODE_ROOT" ] || ! [ -e "$NODE_ROOT/node" ]; then
	no_nodejs
fi

trap "echo \"Aborting execution...\"" 2

echo "Starting core\n-------------"
if [ -n "$DEBUG" ]; then
	gdb -args $NODE_ROOT/node core.js $@
else
	$NODE_ROOT/node core.js $@
fi
res=$?
echo "-------------\nCore exited"
exit $?
