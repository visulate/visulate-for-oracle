import logging
import uvicorn
from common.service_template import create_agent_app
from comment_generator.agent import create_comment_generator_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = create_agent_app(create_comment_generator_agent, "comment_generator_agent")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10003)
