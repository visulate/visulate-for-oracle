#!/bin/bash

# Start the query engine (Gunicorn) in the background
echo "Starting Query Engine..."
gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()" &
QUERY_ENGINE_PID=$!

# Wait for query engine to be ready (optional, but good practice)
sleep 5

# Wait for query engine to be ready (optional, but good practice)
wait $QUERY_ENGINE_PID

# Exit with status of process that exited first
exit $?
