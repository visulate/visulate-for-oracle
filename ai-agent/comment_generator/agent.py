import logging
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

# Import from local modules
from comment_generator.main import CommentGenerator, MCPClient, get_config
from common.credentials import CredentialManager

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are the Oracle Comment Generator Agent.
Your purpose is to generate meaningful comments for Oracle database objects (tables and views) that are missing them.

You have a tool `generate_comments` that performs the following:
1. Identifies tables and views in a specific schema that lack comments.
2. Inspects their structure and sample data.
3. Uses a generative AI model to create descriptive comments.
4. Generates a SQL script with "COMMENT ON" statements.

When asked to generate comments, use the `generate_comments` tool.
You should ask for the database name and schema name if not provided.
You can optionally accept a wildcard pattern to filter object names.
"""

def create_generate_comments_tool() -> FunctionTool:
    """Factory to create the generate_comments tool."""

    def generate_comments(database: str, schema: str, wildcard: str = "%", output_file: str = "generated_comments.sql") -> str:
        """
        Generates comments for Oracle database objects missing them.

        Args:
            database: The name of the database to connect to.
            schema: The schema to analyze.
            wildcard: Optional pattern to filter table/view names (default: "%").
            output_file: The output SQL file path (default: "generated_comments.sql").

        Returns:
            A message indicating success or failure, and the path to the output file.
        """
        try:
            # 1. Get Password
            cred_manager = CredentialManager()
            password = cred_manager.get_password(database, schema)

            if not password:
                return f"Error: Password not found for {database}.{schema}"

            # 2. Setup Client
            config = get_config()
            client = MCPClient(config)

            logger.info("Creating credential token...")
            if not client.create_credential_token(database, schema, password):
                return "Error: Failed to create credential token."

            # 3. Run Generator
            generator = CommentGenerator(client, database, schema)
            generator.run(wildcard, output_file)

            return f"Successfully generated comments for {schema} in {database}. Output written to {output_file}"

        except Exception as e:
            logger.error(f"Error in generate_comments: {e}")
            return f"Error occurred: {str(e)}"

    return FunctionTool(generate_comments)

logger.info("--- Creating Comment Generator Agent... ---")

root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="comment_generator_agent",
    description="An agent that generates comments for Oracle database objects.",
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        create_generate_comments_tool()
    ],
)

logger.info("Comment Generator Agent created successfully!")


if __name__ == "__main__":
    import uvicorn
    import uuid
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from google.adk.runners import Runner
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    from google.genai import types

    session_service = InMemorySessionService()
    runner = Runner(
        app_name="comment_generator",
        agent=root_agent,
        session_service=session_service
    )

    app = FastAPI()

    @app.post("/agent/generate")
    async def generate(request: Request):
        try:
            data = await request.json()
            message = data.get("message", "")

            content = types.Content(role="user", parts=[types.Part(text=message)])

            response_text = ""
            session_id = str(uuid.uuid4())

            # Create Session
            await session_service.create_session(
                app_name="comment_generator",
                user_id="comment_gen_user",
                session_id=session_id
            )

            async for event in runner.run_async(user_id="comment_gen_user", session_id=session_id, new_message=content):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            response_text += part.text

            return JSONResponse(content=response_text)

        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return JSONResponse(content={"error": str(e)}, status_code=500)

    logger.info("Starting Comment Generator Agent on port 10001...")
    uvicorn.run(app, host="0.0.0.0", port=10001)
