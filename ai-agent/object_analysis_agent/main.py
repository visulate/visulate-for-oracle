import logging
import uvicorn
from common.service_template import create_agent_app
from object_analysis_agent.agent import create_object_analysis_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_agent_app(create_object_analysis_agent, "object_analysis_agent")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10002)
