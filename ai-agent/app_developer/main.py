import logging
import uvicorn
from common.service_template import create_agent_app
from app_developer.agent import create_app_developer_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_agent_app(create_app_developer_agent, "app_developer_agent")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10007)
