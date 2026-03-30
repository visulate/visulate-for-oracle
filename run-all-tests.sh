#!/bin/bash
# run-all-tests.sh
# Executes all test suites for all components (api-server, query-engine, ai-agent, ui)

# Terminal colors for simple formatting
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=========================================================="
echo " Starting Full Test Suite for Visulate for Oracle Components"
echo "=========================================================="

FAILURES=0

# 1. Run API Server tests (Node/Mocha)
echo -e "\n${GREEN}>>> 1. Running API Server Tests (NodeJS/Mocha)...${NC}"
cd api-server || { echo -e "${RED}Failed to change directory to api-server. Aborting test run.${NC}"; exit 1; }
npm install || { echo -e "${RED}npm install failed in api-server. Aborting test run.${NC}"; exit 1; }
npm run test || FAILURES=$((FAILURES + 1))
cd ..

# 2. Run Query Engine tests (Python/Pytest)
echo -e "\n${GREEN}>>> 2. Running Query Engine Tests (Python/Pytest)...${NC}"
cd query-engine || { echo -e "${RED}Failed to change directory to query-engine. Aborting test run.${NC}"; exit 1; }
if [ -d "venv" ]; then
    echo "Activating existing virtual environment..."
    source venv/bin/activate || { echo -e "${RED}Failed to activate existing virtual environment in query-engine. Aborting test run.${NC}"; exit 1; }
else
    echo "Creating new virtual environment..."
    python3 -m venv venv || { echo -e "${RED}Failed to create virtual environment in query-engine. Aborting test run.${NC}"; exit 1; }
    source venv/bin/activate || { echo -e "${RED}Failed to activate new virtual environment in query-engine. Aborting test run.${NC}"; exit 1; }
fi
pip install -r requirements.txt || { echo -e "${RED}pip install failed in query-engine. Aborting test run.${NC}"; deactivate; exit 1; }
pytest tests/ || FAILURES=$((FAILURES + 1))
deactivate
cd ..

# 3. Run AI Agent tests (Python/UV/Pytest)
echo -e "\n${GREEN}>>> 3. Running AI Agent Tests (Python/UV/Pytest)...${NC}"
cd ai-agent || { echo -e "${RED}Failed to change directory to ai-agent. Aborting test run.${NC}"; exit 1; }
uv run pytest || FAILURES=$((FAILURES + 1))
cd ..

# 4. Run UI Component tests (Angular/Karma/Jasmine Headless)
echo -e "\n${GREEN}>>> 4. Running UI Tests (Angular Headless Setup)...${NC}"
cd ui || { echo -e "${RED}Failed to change directory to ui. Aborting test run.${NC}"; exit 1; }
npm install || { echo -e "${RED}npm install failed in ui. Aborting test run.${NC}"; exit 1; }
npm run test -- --watch=false --browsers=ChromeHeadless || FAILURES=$((FAILURES + 1))
cd ..

echo -e "\n=========================================================="
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}   SUCCESS: All Visulate for Oracle test suites passed!   ${NC}"
    echo -e "=========================================================="
    exit 0
else
    echo -e "${RED}   FAILURE: $FAILURES test suite(s) failed.   ${NC}"
    echo -e "=========================================================="
    exit 1
fi
