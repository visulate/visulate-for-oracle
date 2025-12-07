#!/bin/bash

# Start Visulate Agent
python -m visulate_agent.agent &
PID1=$!

# Start Comment Generator Agent
python -m comment_generator.agent &
PID2=$!

echo "Agents started on ports 10000 and 10001"

# Wait for process to exit
wait $PID1 $PID2
