#!/bin/bash
# Local development startup script
# Starts API Server, Query Engine, and AI Agents in background

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "Loading environment variables from .env"
    export $(grep -v '^#' .env | xargs)
fi

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

if [ -z "$LOCAL_WHITELIST" ]; then
    echo "LOCAL_WHITELIST check: Not found in environment."
    read -p "Enter additional CORS origins (comma separated) or press Enter to skip: " INPUT_WHITELIST
    if [ -n "$INPUT_WHITELIST" ]; then
        export LOCAL_WHITELIST="$INPUT_WHITELIST"
    fi
else
    echo "LOCAL_WHITELIST check: Found in environment."
fi
export GOOGLE_AI_KEY
export GOOGLE_API_KEY="${GOOGLE_AI_KEY}"
export VISULATE_BASE="http://localhost:3000"
export VISULATE_AGENT_URL=http://localhost:10000/agent/generate
export COMMENT_GENERATOR_URL=http://localhost:10003/agent/generate
export INVALID_OBJECTS_URL=http://localhost:10006/agent/generate
export APP_DEVELOPER_URL=http://localhost:10007/agent/generate
export TEST_DATA_GENERATOR_URL=http://localhost:10008/agent/generate
export SCHEMA_COMPARISON_URL=http://localhost:10009/agent/generate
export QUERY_ENGINE_URL=http://localhost:5000/mcp-sql/call_tool
export CORS_ORIGIN_WHITELIST="http://localhost:3000,http://localhost:4200"
if [ -n "$LOCAL_WHITELIST" ]; then
    export CORS_ORIGIN_WHITELIST="${CORS_ORIGIN_WHITELIST},${LOCAL_WHITELIST}"
fi
export VISULATE_DOWNLOADS=$(pwd)/downloads
export GIT_REPOS_DIR="${GIT_REPOS_DIR:-$HOME/git}"
export GIT_MODE="${GIT_MODE:-local}"
export ENABLE_GIT_INTEGRATION="${ENABLE_GIT_INTEGRATION:-true}"
export TNS_ADMIN=${TNS_ADMIN:-$(pwd)/wallet}
mkdir -p "$TNS_ADMIN"
mkdir -p "$GIT_REPOS_DIR"
mkdir -p downloads/metadata

# Trap to kill all background processes on exit
cleanup() {
    trap '' INT TERM EXIT
    echo ""
    echo "Stopping all services..."

    # Collect tracked PIDs
    local pids=""
    [ -n "$API_PID" ] && pids="$pids $API_PID"
    [ -n "$QUERY_PID" ] && pids="$pids $QUERY_PID"
    [ -n "$AGENTS_PID" ] && pids="$pids $AGENTS_PID"

    # Send SIGTERM to tracked background processes
    for pid in $pids; do
        kill -TERM "$pid" 2>/dev/null || true
    done

    # Send SIGTERM to the entire process group as a fallback
    kill 0 2>/dev/null || true

    # Wait up to 3 seconds for background services to shut down gracefully and finish logging
    for _ in 1 2 3; do
        local still_running=false
        for pid in $pids; do
            if kill -0 "$pid" 2>/dev/null; then
                still_running=true
                break
            fi
        done
        [ "$still_running" = "false" ] && break
        sleep 1
    done

    # Force kill any remaining child processes
    for pid in $pids; do
        kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    done

    wait 2>/dev/null || true
    echo "All services stopped."
    exit 0
}
trap cleanup INT TERM EXIT

# Clean up any stale Visulate processes on ports 3000 and 5000 before starting
for port in 3000 5000; do
    if command -v fuser >/dev/null 2>&1 && fuser $port/tcp >/dev/null 2>&1; then
        pids=$(fuser $port/tcp 2>/dev/null)
        is_visulate=false
        for pid in $pids; do
            cmd=$(ps -p "$pid" -o cmd= 2>/dev/null || true)
            if echo "$cmd" | grep -qE "node.*app\.js|gunicorn.*sql2csv|api-server|query-engine"; then
                is_visulate=true
                echo "Port $port is in use by stale Visulate process (PID $pid). Stopping it..."
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
        if [ "$is_visulate" = "true" ]; then
            sleep 1
            for pid in $pids; do
                kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
            done
        else
            echo "Warning: Port $port is in use by an external process ($pids). Startup may fail if port is occupied."
        fi
    fi
done

# Clear credential cache from shared memory on startup
if [ -d "/dev/shm/mcp_credentials" ]; then
    echo "Clearing credential cache in /dev/shm..."
    rm -rf /dev/shm/mcp_credentials/*
fi


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
    echo "Agents: ports 10000-10009"
fi
echo "Press Ctrl+C to stop all services."

wait
