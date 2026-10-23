#!/bin/bash

# Leave ADC free to discover credentials when no file is configured.
if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
    unset GOOGLE_APPLICATION_CREDENTIALS
fi

# Check if Vertex AI is enabled via environment variables.
# Do not enable Vertex AI if GOOGLE_GENAI_USE_VERTEXAI is explicitly set to false.
IS_VERTEX=false
if [ "$GOOGLE_GENAI_USE_VERTEXAI" = "true" ] || [ "$GOOGLE_GENAI_USE_VERTEXAI" = "1" ] || [ "$VERTEX_AI" = "true" ]; then
    IS_VERTEX=true
    export GOOGLE_GENAI_USE_VERTEXAI=true
elif [ "$GOOGLE_GENAI_USE_VERTEXAI" != "false" ] && [ -n "$GOOGLE_CLOUD_PROJECT" ] && [ -z "$GOOGLE_API_KEY" ] && [ -z "$GOOGLE_AI_KEY" ]; then
    IS_VERTEX=true
    export GOOGLE_GENAI_USE_VERTEXAI=true
fi

# Skip deployment if neither AI key nor Vertex AI configuration is provided
if [ -z "$GOOGLE_API_KEY" ] && [ -z "$GOOGLE_AI_KEY" ] && [ "$IS_VERTEX" != "true" ]; then
    echo "No AI credentials found (neither API key nor Vertex AI configuration). Skipping AI agent deployment."
    exit 0
fi

# If using AI Studio API key, ensure GOOGLE_API_KEY is populated
if [ -z "$GOOGLE_API_KEY" ] && [ -n "$GOOGLE_AI_KEY" ]; then
    export GOOGLE_API_KEY="$GOOGLE_AI_KEY"
fi

cleanup_agents() {
    trap '' INT TERM EXIT
    pids=$(jobs -p)
    if [ -n "$pids" ]; then
        kill -TERM $pids 2>/dev/null || true
        sleep 1
        kill -KILL $pids 2>/dev/null || true
    fi
    exit 0
}
trap cleanup_agents INT TERM EXIT

# Start specialized agents in background
python -m nl2sql_agent.main &
python -m object_analysis_agent.main &
python -m schema_analysis_agent.main &
python -m erd_agent.main &
python -m comment_generator.app &
python -m invalid_objects.main &
python -m app_developer.main &
python -m test_data_generator.main &
python -m schema_comparison_agent.main &
python -m readme_generator.main &

# Start Root Agent
python -m root_agent.main &

echo "Agents started:"
echo "- Root Agent: http://localhost:10000"
echo "- NL2SQL Agent: http://localhost:10001"
echo "- Object Analysis Agent: http://localhost:10002"
echo "- Comment Generator: http://localhost:10003"
echo "- Schema Analysis Agent: http://localhost:10004"
echo "- ERD Agent: http://localhost:10005"
echo "- Invalid Objects Agent: http://localhost:10006"
echo "- App Developer Agent: http://localhost:10007"
echo "- Test Data Generator Agent: http://localhost:10008"
echo "- Schema Comparison Agent: http://localhost:10009"
echo "- README Generator Agent: http://localhost:10010"

# Wait for all background processes
wait
