import logging
import uvicorn
from common.service_template import create_agent_app
from invalid_objects.agent import create_invalid_objects_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_agent_app(create_invalid_objects_agent, "invalid_objects_agent")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10006)
