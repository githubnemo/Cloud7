#!/bin/sh

if [ -e "start_config" ]; then
	echo "Reading configuration"
	. ./start_config
fi

no_nodejs() {
	echo "node.js not found. Configure \$NODE_PATH in file start_config or fix your PATH"
	exit 1
}

if [ -z "$NODE_PATH" ] && ! which node >/dev/null; then
	no_nodejs
elif [ -z "$NODE_PATH" ]; then
	NODE_PATH=$(dirname $(which node))
fi

# Check for existance of executable
if [ -z "$NODE_PATH" ] || ! [ -e "$NODE_PATH/node" ]; then
	no_nodejs
fi

trap "echo \"Aborting execution...\"" 2

echo "Starting core"
$NODE_PATH/node core.js
res=$?
echo "Core exited"
exit $?
