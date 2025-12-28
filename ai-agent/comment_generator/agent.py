import logging
import os
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

# Import from local modules
from comment_generator.main import CommentGenerator, MCPClient, get_config
from common.credentials import CredentialManager
from common.context import session_id_var, progress_callback_var, auth_token_var, cancelled_var
import asyncio

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are the Oracle Comment Generator Agent.
Your purpose is to generate meaningful comments for Oracle database objects (tables and views) that are missing them.

You have a tool `generate_comments` that performs the following:
1. Identifies tables and views in a specific schema that lack comments.
2. Inspects their structure and sample data.
3. Uses a generative AI model to create descriptive comments.
4. Generates a SQL script with "COMMENT ON" statements.

When asked to generate comments, use the `generate_comments` tool.
Check the provided input context for database ("endpoint") and schema ("owner") names.
If not found in the context or message, ask the user for them.
You can optionally accept a wildcard pattern to filter object names.
"""

def create_generate_comments_tool() -> FunctionTool:
    """Factory to create the generate_comments tool."""

    async def generate_comments(database: str, schema: str, wildcard: str = "%") -> str:
        """
        Generates comments for Oracle database objects missing them.

        Args:
            database: The name of the database to connect to.
            schema: The schema to analyze.
            wildcard: Optional pattern to filter table/view names (default: "%").

        Returns:
            A message indicating success or failure, and the download link.
        """
        try:
            # Get session ID from context
            session_id = session_id_var.get()

            # Define output directory and file
            # Use relative path for local development compatibility
            downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
            output_dir = os.path.join(downloads_base, session_id)
            filename = f"comments_{schema}_{database}.sql"
            output_file = f"{output_dir}/{filename}"

            # Ensure directory exists
            os.makedirs(output_dir, exist_ok=True)

            # 1. Get auth token from context
            auth_token = auth_token_var.get()

            # 2. Setup Client
            config = get_config()
            client = MCPClient(config)

            # 3. Run Generator
            generator = CommentGenerator(client, database, schema, credential_token=auth_token, session_id=session_id)
            stmt_count = await generator.run(wildcard, output_file)

            if stmt_count == 0:
                return f"No Oracle objects (tables or views) in {schema} were found that are missing comments."

            # Return a download link (or path that the UI can interpret)
            # The API server will proxy /download/{session_id}/{filename}
            download_link = f"/download/{session_id}/{filename}"

            # Use progress_callback to ensure it reaches the UI immediately
            from common.context import progress_callback_var
            callback = progress_callback_var.get()
            final_msg = f"Successfully generated comments for {schema} in {database}. \nDownload the SQL script here: [Download SQL]({download_link})"
            if callback:
                 callback(f"▌SUCCESS: {final_msg}")

            return final_msg

        except Exception as e:
            logger.error(f"Error in generate_comments: {e}")
            return f"Error occurred: {str(e)}"

    return FunctionTool(generate_comments)

def create_comment_generator_agent() -> LlmAgent:
    logger.info("--- Creating Comment Generator Agent... ---")

    return LlmAgent(
        model="gemini-flash-latest",
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
    from fastapi.responses import JSONResponse, StreamingResponse
    from google.adk.runners import Runner
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    from google.genai import types

    session_service = InMemorySessionService()
    # Initialize Root Agent and Runner
    agent = create_comment_generator_agent()
    session_service = InMemorySessionService()
    runner = Runner(
        app_name="comment_generator",
        agent=agent,
        session_service=session_service
    )

    app = FastAPI()

    @app.post("/agent/generate")
    async def generate(request: Request):
        try:
            data = await request.json()
            message = data.get("message", "")
            context_data = data.get("context", {})
            auth_token = context_data.get("authToken")

            content = types.Content(role="user", parts=[types.Part(text=message)])
            session_id = str(uuid.uuid4())

            async def stream_generator():
                queue = asyncio.Queue()
                session_token = session_id_var.set(session_id)
                auth_token_token = None
                if auth_token:
                    auth_token_token = auth_token_var.set(auth_token)

                loop = asyncio.get_running_loop()
                def progress_callback(msg):
                    try:
                        loop.call_soon_threadsafe(queue.put_nowait, f"▌STATUS: {msg}\n")
                    except Exception as e:
                        logger.error(f"Error in progress callback: {e}")

                progress_callback_token = progress_callback_var.set(progress_callback)

                try:
                    # Create Session
                    await session_service.create_session(
                        app_name="comment_generator",
                        user_id="comment_gen_user",
                        session_id=session_id
                    )

                    async def run_agent():
                        logger.info(f"Starting run_agent task for session {session_id}")
                        try:
                            # Default runner run_async uses streaming if available
                            async for event in runner.run_async(
                                user_id="comment_gen_user",
                                session_id=session_id,
                                new_message=content
                            ):
                                if event.content and event.content.parts:
                                    for part in event.content.parts:
                                        if part.text:
                                            await queue.put(part.text)
                        except Exception as e:
                            logger.error(f"Error in runner: {e}")
                            await queue.put(f"▌ERROR: {str(e)}\n")
                        finally:
                            await queue.put(None)

                    agent_task = asyncio.create_task(run_agent())

                    while True:
                        if await request.is_disconnected():
                            logger.info(f"Client disconnected for session {session_id}. Cancelling agent task.")
                            from common.context import cancelled_var, cancelled_sessions
                            cancelled_sessions.add(session_id)
                            cancelled_var.set(True) # Signal cancellation to tools
                            agent_task.cancel()
                            break

                        try:
                            item = await asyncio.wait_for(queue.get(), timeout=1.0)
                            if item is None:
                                break
                            if isinstance(item, str):
                                if item.startswith("▌"):
                                    logger.info(f"YIELDING_STATUS: {item.strip()}")
                                    import sys
                                    sys.stdout.flush()
                                else:
                                    logger.info(f"YIELDING_TEXT: {len(item)} chars")
                            yield item
                        except asyncio.TimeoutError:
                            # Yield a heartbeat to keep the SSE connection alive
                            yield " "
                            continue

                    await agent_task
                finally:
                    if not agent_task.done():
                        agent_task.cancel()
                    from common.context import cancelled_var
                    cancelled_var.set(True) # Signal cancellation to tools
                    session_id_var.reset(session_token)
                    if auth_token_token:
                        auth_token_var.reset(auth_token_token)
                    progress_callback_var.reset(progress_callback_token)
                    logger.info(f"Cleanup completed for session {session_id}")

            return StreamingResponse(stream_generator(), media_type="text/plain")

        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return JSONResponse(content={"error": str(e)}, status_code=500)

    logger.info("Starting Comment Generator Agent on port 10001...")
    uvicorn.run(app, host="0.0.0.0", port=10001)
