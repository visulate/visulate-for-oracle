#!/bin/bash
API_ENDPOINT=${1:-'http://localhost:3000/api'}
UBBAGENT_ENDPOINT=${2:-'http://localhost:4567/report'}

# Count the database connections returned by the API endpoint. 
# Default to 0 if the API call takes more than 40 seconds to repsond  
echo "curl -m 40 "$API_ENDPOINT"|jq '.endpoints | length'"
DATABASE_CONNECTION_COUNT=`curl -m 40 "$API_ENDPOINT"|jq '.endpoints | length'`
if [ -z "$DATABASE_CONNECTION_COUNT" ]
then 
  DATABASE_CONNECTION_COUNT=0
fi

read -d '' REPORT <<EOF
{
  "name": "database_connections",
  "startTime": "$(date --date="60 sec ago" -u +"%Y-%m-%dT%H:%M:%SZ")",
  "endTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "value": { "int64Value": $DATABASE_CONNECTION_COUNT }
}
EOF
echo "curl -m 10 -X POST -d "$REPORT" "$UBBAGENT_ENDPOINT""
`curl -m 10 -X POST -d "$REPORT" "$UBBAGENT_ENDPOINT"`