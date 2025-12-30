import logging
import uvicorn
from common.service_template import create_agent_app
from nl2sql_agent.agent import create_nl2sql_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_agent_app(create_nl2sql_agent, "nl2sql_agent")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10001)
