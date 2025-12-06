#!/bin/bash

# Start the query engine (Gunicorn) in the background
echo "Starting Query Engine..."
gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()" &
QUERY_ENGINE_PID=$!

# Wait for query engine to be ready (optional, but good practice)
sleep 5

# Start the Visulate Agent
echo "Starting Visulate Agent..."


# Start the Comment Generator Agent
# Assuming comment_generator is also runnable as a module or script
# Adjust command based on actual agent structure.
# Based on file listing, comment_generator has an agent.py.
# python3.11 -m ai-agent.comment_generator.agent &
# BUT, we need to be careful about python path.
# Dockerfile sets PYTHONPATH=/query-engine
# ai-agent is mounted at /query-engine/ai-agent
# So visulate_ai_agent should be importable if it's a package in ai-agent.
# Let's check listing again.
# ai-agent/visulate_agent/agent.py
# ai-agent/comment_generator/agent.py

echo "Starting Comment Generator Agent..."

# We might need to run them as scripts if they are not installed packages
# python3.11 ai-agent/visulate_agent/agent.py
# python3.11 ai-agent/comment_generator/agent.py

# However, the previous step used `python3.11 -m visulate_ai_agent.agent`
# Let's adjust to be robust.

# Add ai-agent to PYTHONPATH
export PYTHONPATH=$PYTHONPATH:$(pwd)/ai-agent

echo "Updated PYTHONPATH: $PYTHONPATH"

# Run agents
# Run agents
python3 -m visulate_agent.agent &
VISULATE_AGENT_PID=$!

python3 -m comment_generator.agent &
COMMENT_GENERATOR_PID=$!


# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
