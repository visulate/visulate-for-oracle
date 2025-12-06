#!/bin/bash
# Local development startup script
# Starts API Server, Query Engine, and AI Agents in background

if [ -z "$GOOGLE_AI_KEY" ]; then
    echo "GOOGLE_AI_KEY check: Not found in environment."
    read -p "Please enter your Google AI Key: " INPUT_KEY
    if [ -z "$INPUT_KEY" ]; then
        echo "Error: Google AI Key is required."
        exit 1
    fi
    export GOOGLE_AI_KEY="$INPUT_KEY"
else
    echo "GOOGLE_AI_KEY check: Found in environment."
fi
export GOOGLE_AI_KEY
export GOOGLE_API_KEY="${GOOGLE_AI_KEY}"
export VISULATE_BASE="http://localhost:3000"
export VISULATE_AGENT_URL=http://localhost:10000/agent/generate
export COMMENT_GENERATOR_URL=http://localhost:10001/agent/generate

# Trap to kill all background processes on exit
trap 'kill $(jobs -p)' EXIT

echo "Starting API Server..."
cd api-server
npm start &
API_PID=$!
cd ..

echo "Starting Query Engine and Agents..."
cd query-engine
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi
# Ensure AI agent is in PYTHONPATH
# Assuming we are in query-engine directory, ai-agent is in ../ai-agent
export PYTHONPATH=$PYTHONPATH:$(pwd)/../ai-agent

# Start Query Engine
gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()" &
QUERY_PID=$!

# Start Agents
python3 -m visulate_agent.agent &
AGENT1_PID=$!

python3 -m comment_generator.agent &
AGENT2_PID=$!

cd ..

echo "Services started."
echo "API Server: http://localhost:3000"
echo "Query Engine: http://localhost:5000"
echo "Agents: ports 10000, 10001"
echo "Press Ctrl+C to stop all services."

wait
