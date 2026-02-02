#!/bin/bash
# Local development startup script
# Starts API Server, Query Engine, and AI Agents in background

if [ -z "$GOOGLE_AI_KEY" ]; then
    echo "GOOGLE_AI_KEY check: Not found in environment."
    read -p "Enter your Google AI Key or press Enter to skip AI: " INPUT_KEY
    if [ -z "$INPUT_KEY" ]; then
        echo "Skipping AI setup. AI agents will not be started."
    else
        export GOOGLE_AI_KEY="$INPUT_KEY"
    fi
else
    echo "GOOGLE_AI_KEY check: Found in environment."
fi
export GOOGLE_AI_KEY
export GOOGLE_API_KEY="${GOOGLE_AI_KEY}"
export VISULATE_BASE="http://localhost:3000"
export VISULATE_AGENT_URL=http://localhost:10000/agent/generate
export COMMENT_GENERATOR_URL=http://localhost:10003/agent/generate
export INVALID_OBJECTS_URL=http://localhost:10006/agent/generate
export APP_DEVELOPER_URL=http://localhost:10007/agent/generate
export TEST_DATA_GENERATOR_URL=http://localhost:10008/agent/generate
export QUERY_ENGINE_URL=http://localhost:5000/mcp-sql/call_tool
export CORS_ORIGIN_WHITELIST="http://localhost:3000,http://localhost:4200"
export VISULATE_DOWNLOADS=$(pwd)/downloads
mkdir -p downloads/metadata

# Trap to kill all background processes on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT


echo "Starting API Server..."
(cd api-server && npm start) &
API_PID=$!

echo "Starting Query Engine..."
(
    cd query-engine
    if [ -d "venv" ]; then
        echo "Activating virtual environment for Query Engine..."
        source venv/bin/activate
    fi
    exec gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()"
) &
QUERY_PID=$!

if [ ! -z "$GOOGLE_AI_KEY" ]; then
    export GOOGLE_API_KEY="${GOOGLE_AI_KEY}"
    echo "Starting Agents..."
    (
        cd ai-agent
        # Check for venv or create it
        if [ ! -d ".venv" ]; then
            echo "Creating virtual environment for AI Agents..."
            python3 -m venv .venv
            .venv/bin/python -m ensurepip --upgrade
            .venv/bin/python -m pip install -e .
        else
            echo "Activating virtual environment for AI Agents..."
            # Ensure pip is available
            .venv/bin/python -m pip --version >/dev/null 2>&1 || .venv/bin/python -m ensurepip --upgrade
            .venv/bin/python -m pip install -e .
        fi
        chmod +x start_agents.sh
        export PATH=$(pwd)/.venv/bin:$PATH
        ./start_agents.sh
    ) &
    AGENTS_PID=$!
fi

echo "Services started."
echo "API Server: http://localhost:3000"
echo "Query Engine: http://localhost:5000"
if [ ! -z "$GOOGLE_AI_KEY" ]; then
    echo "Agents: ports 10000-10008"
fi
echo "Press Ctrl+C to stop all services."

wait
