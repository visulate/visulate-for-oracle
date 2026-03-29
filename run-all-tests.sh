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
cd api-server
npm install
npm run test || FAILURES=$((FAILURES + 1))
cd ..

# 2. Run Query Engine tests (Python/Pytest)
echo -e "\n${GREEN}>>> 2. Running Query Engine Tests (Python/Pytest)...${NC}"
cd query-engine
if [ -d "venv" ]; then
    echo "Activating existing virtual environment..."
    source venv/bin/activate
else
    echo "Creating new virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
fi
pip install -r requirements.txt
pytest tests/ || FAILURES=$((FAILURES + 1))
deactivate
cd ..

# 3. Run AI Agent tests (Python/UV/Pytest)
echo -e "\n${GREEN}>>> 3. Running AI Agent Tests (Python/UV/Pytest)...${NC}"
cd ai-agent
uv run pytest || FAILURES=$((FAILURES + 1))
cd ..

# 4. Run UI Component tests (Angular/Karma/Jasmine Headless)
echo -e "\n${GREEN}>>> 4. Running UI Tests (Angular Headless Setup)...${NC}"
cd ui
npm install
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
