#!/bin/bash

# Skip deployment if AI key is missing
if [ -z "$GOOGLE_API_KEY" ] && [ -z "$GOOGLE_AI_KEY" ]; then
    echo "AI key not found. Skipping AI agent deployment."
    exit 0
fi

# Start specialized agents in background
python -m nl2sql_agent.main &
python -m object_analysis_agent.main &
python -m schema_analysis_agent.main &
python -m erd_agent.main &
python -m comment_generator.app &
python -m invalid_objects.main &
python -m app_developer.main &

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

# Wait for all background processes
wait
