#!/bin/sh

if [ -e "start_config" ]; then
	echo "Reading configuration"
	. ./start_config
fi

if [ -z "$NODE" ] && ! which node >/dev/null; then
	echo "node.js not found. Configure \$NODE in file start_config or fix your PATH"
	exit 1
elif [ -z "$NODE" ]; then
	NODE=$(which node)
fi

trap "echo \"Aborting execution...\"" 2

echo "Starting core"
$NODE_PATH/node core.js
res=$?
echo "Core exited"
exit $?
