#!/bin/sh

no_nodejs() {
	echo "node.js not found. Configure \$NODE_ROOT in file start_config or fix your PATH"
	exit 1
}

NODE_ROOT="$(pwd)/$(dirname $0)/../node/"

LIBRARY_PATH="$(pwd)/$(dirname $0)/lib/peers/libcage/src":"$(pwd)/$(dirname $0)/lib/peers/libev/.libs":

DYLD_LIBRARY_PATH=$DYLD_LIBRARY_PATH:$LIBRARY_PATH
export DYLD_LIBRARY_PATH

LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$LIBRARY_PATH
export LD_LIBRARY_PATH

if [ -e "start_config" ]; then
	echo "Reading configuration"
	. ./start_config
fi

# Enable use of globally installed nodejs
#if [ -z "$NODE_ROOT" ] && ! which node >/dev/null; then
#	no_nodejs
#elif [ -z "$NODE_ROOT" ]; then
#	NODE_ROOT=$(dirname $(which node))
#fi

# Check for existance of executable
if [ -z "$NODE_ROOT" ] || ! [ -e "$NODE_ROOT/node" ]; then
	no_nodejs
fi

trap "echo \"Aborting execution...\"" 2

echo "Starting core\n-------------"
if [ -n "$DEBUG" ]; then
	gdb -args $NODE_ROOT/node "$(pwd)/$(dirname $0)/core.js" $@
else
	$NODE_ROOT/node "$(pwd)/$(dirname $0)/core.js" $@
fi
res=$?
echo "-------------\nCore exited"
exit $?
