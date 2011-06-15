#!/bin/sh

if [ -n "$CONFPREFIX" ]; then
	CONFIG=$CONFPREFIX/start_config
else
	CONFIG=./start_config
fi

if [ -e "$CONFIG" ]; then
	echo "Reading configuration"
	. $CONFIG
fi

NODE_ROOT="$(pwd)/$(dirname $0)/../node/"

LIBRARY_PATH="$(pwd)/$(dirname $0)/lib/peers/libcage/src":"$(pwd)/$(dirname $0)/lib/peers/libev/.libs":

DYLD_LIBRARY_PATH=$DYLD_LIBRARY_PATH:$LIBRARY_PATH
export DYLD_LIBRARY_PATH

LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$LIBRARY_PATH
export LD_LIBRARY_PATH

no_nodejs() {
	echo "node.js not found. Configure \$NODE_ROOT in file start_config or fix your PATH"
	exit 1
}

if [ -z "$NODE_ROOT" ] && ! which node >/dev/null; then
	no_nodejs
elif [ -z "$NODE_ROOT" ]; then
	NODE_ROOT=$(dirname $(which node))
fi

if [ -z "$NODE_ROOT" ]; then
	no_nodejs
fi

trap "echo \"Aborting execution...\"" 2

echo "Starting nodejs"
if [ -n "$DEBUG" ]; then
	gdb -args $NODE_ROOT/node $*
else
	$NODE_ROOT/node $*
fi
res=$?
echo "nodejs exited"
exit $?
