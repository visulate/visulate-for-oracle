import logging
import os
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

# Import from local modules
from comment_generator.main import CommentGenerator, MCPClient
from common.credentials import CredentialManager
from common.context import session_id_var, browser_session_id_var, progress_callback_var, auth_token_var, cancelled_var, ui_context_var, db_credentials_var, timeout_signal_var, cancelled_sessions
import asyncio
from datetime import datetime
from pathlib import Path
from google.adk.tools.mcp_tool import McpToolset

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are the Visulate Comment Generator Agent.
Your purpose is to generate meaningful comments for Oracle database objects (tables and views) that are missing them.

## Operational Rules
1. **Strict Mission Scoping (Radical Stop)**: If a user asks for a specific table or a pattern (e.g., "PR_ tables"), you MUST call `generate_comments` EXACTLY ONCE with that target.
   - **No Wildcard Expansion**: Use the exact name or pattern provided. If the user says "mls_listings", use `wildcard='MLS_LISTINGS'`. Do NOT use `%MLS_LISTINGS%` or `%`.
   - **Mission Termination**: Once the tool call is complete, your mission for that turn is OVER. Regardless of the outcome (Success or No Objects Found), DO NOT probe the rest of the schema for unrelated missing work.
2. **One Tool Call Per Mission**: Do not call `generate_comments` or `getObjectsMissingComments` multiple times in a row for a single user request. Trust the first result.
3. **Response Priority (CRITICAL)**: Your final response MUST START with the download link using the format `[Download SQL](link)`. Do not provide any preamble or commentary before the link.

You have a tool `generate_comments` that performs the following:
1. Identifies tables and views in a specific schema that lack comments.
2. Inspects their structure and sample data.
3. Uses a generative AI model to create descriptive comments.
4. Generates a SQL script with "COMMENT ON" statements.

When asked to generate comments, use the `generate_comments` tool.
Check the provided input context for database ("endpoint") and schema ("owner") names.
If not found in the context or message, ask the user for them.
You can optionally accept a wildcard pattern to filter object names.

**STRICT LINK USAGE (CRITICAL)**: When the `generate_comments` tool returns a download link to you, you MUST output that EXACT link to the user in your final response. The download link is the primary wrap-up action. Even if the process is partial or reaches a time limit, the [Download SQL] link is MANDATORY and must be prominently featured as the very first line of your response.
"""

from common.tools import get_mcp_toolsets, create_connection_token_tool

def create_generate_comments_tool(api_server_tools: McpToolset, query_engine_tools: McpToolset) -> FunctionTool:
    """Factory to create the generate_comments tool."""

    async def generate_comments(database: str, schema: str, wildcard: str = "%", offset: int = 0) -> str:
        """
        Generates comments for Oracle database objects missing them.

        Args:
            database: The name of the database to connect to.
            schema: The schema to analyze.
            wildcard: Optional pattern to filter table/view names (default: "%").
            offset: Optional index to start from. Use this to resume a previous task (default: 0).

        Returns:
            A message indicating success or failure, and the download link.
        """
        try:
            # Get session ID from context
            session_id = session_id_var.get()
            browser_session_id = browser_session_id_var.get()
            storage_id = browser_session_id or session_id

            # Define output directory and file
            downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
            output_dir = os.path.join(downloads_base, storage_id)
            safe_schema = "".join([c if c.isalnum() else "_" for c in schema]).strip("_")
            safe_database = "".join([c if c.isalnum() else "_" for c in database]).strip("_")
            filename = f"comments_{safe_database}_{safe_schema}.sql"
            output_file = Path(output_dir) / filename

            # Return a download link
            download_link = f"/download/{storage_id}/{filename}"
            
            # Ensure directory exists
            os.makedirs(output_dir, exist_ok=True)

            # 1. Get auth token from context
            auth_token = auth_token_var.get()

            # 2. Setup Client using provided toolsets
            client = MCPClient(api_server_tools, query_engine_tools, session_id=session_id)

            # 3. Resolve username for authentication
            # In Postgres, the schema (e.g. public) often differs from the user (e.g. visulate)
            ui_ctx = ui_context_var.get() or {}
            db_creds = db_credentials_var.get() or {}
            
            # Try to find username in db credentials first
            username = None
            if isinstance(db_creds, dict):
                # Check for database-specific credentials
                if database in db_creds and isinstance(db_creds[database], dict):
                    username = db_creds[database].get("username")
                # Fallback to top-level username
                if not username:
                    username = db_creds.get("username")
            
            # 4. Run Generator
            generator = CommentGenerator(client, database, schema, credential_token=auth_token, session_id=session_id, username=username)
            stmt_count = await generator.run(wildcard, str(output_file), offset=offset)

            if stmt_count == -1:
                return (f"I have paused the comment generation because no database credentials were found. "
                        f"Data sampling requires authentication and provides significantly better results.\n\n"
                        f"### RESUME_OFFSET: 0\n\n"
                        f"**Choose your next step:**\n"
                        f"1. **Login**: Click the Amber key icon, enter credentials, and then tell me to 'continue'.\n"
                        f"2. **Proceed anyway**: Tell me to 'proceed without sampling' if you prefer basic metadata-only comments.")

            if stmt_count == 0:
                if timeout_signal_var.get():
                     return (f"[Download SQL]({download_link})\n\n"
                             f"Reached processing time limit before I could finish any new objects in this turn.\n\n"
                             f"### RESUME_OFFSET: {offset}\n\n"
                             f"Ask me to 'continue' to try the next batch.")

                if offset > 0:
                    return f"[Download SQL]({download_link})\n\nNo more Oracle objects in {schema} were found that are missing comments."
                return f"[Download SQL]({download_link})\n\nAll requested objects in {schema} are already up-to-date in your database or session file."

            # Fail-safe: Always post download link to progress callback so it is visible in the UI
            callback = progress_callback_var.get()
            if callback:
                 callback(f"▌SUCCESS: SQL script is available here: [Download SQL]({download_link})")
            
            # Check for timeout to provide specific guidance
            if timeout_signal_var.get():
                processed_total = offset + stmt_count
                return (f"[Download SQL]({download_link})\n\n"
                        f"Reached processing time limit. I've generated comments for {stmt_count} objects in this turn.\n\n"
                        f"### RESUME_OFFSET: {processed_total}\n\n"
                        f"**Recommendation:** Apply these comments now using the SQL script. Once applied, ask me to 'continue' to process the remaining objects.")

            final_msg = f"[Download SQL]({download_link})\n\nSUCCESS: Generated {stmt_count} comments."
            if offset > 0:
                 final_msg = f"[Download SQL]({download_link})\n\nResumed and generated {stmt_count} more comments."
            
            callback = progress_callback_var.get()
            if callback:
                 callback(f"▌SUCCESS: {final_msg}")

            return final_msg

        except Exception as e:
            # Handle graceful stop/timeout
            if str(e) == "Task stopped" or timeout_signal_var.get():
                processed_total = offset + (generator.generated_count if 'generator' in locals() else 0)
                return (f"[Download SQL]({download_link})\n\n"
                        f"▌TIMEOUT: I've reached the processing time limit for this turn. "
                        f"I've saved the comments generated so far to the SQL script.\n\n"
                        f"### RESUME_OFFSET: {processed_total}\n\n"
                        f"Please apply the current script and then ask me to 'continue' to process the remaining objects.")
            
            logger.error(f"Error in generate_comments: {e}")
            return f"Error occurred: {str(e)}"

    return FunctionTool(generate_comments)

def create_comment_generator_agent() -> LlmAgent:
    logger.info("--- Creating Comment Generator Agent... ---")
    api_server_tools, query_engine_tools = get_mcp_toolsets()

    return LlmAgent(
        model="gemini-flash-latest",
        name="comment_generator_agent",
        description="An agent that generates comments for Oracle database objects.",
        instruction=SYSTEM_INSTRUCTION,
        tools=[
            api_server_tools,
            query_engine_tools,
            create_connection_token_tool(),
            create_generate_comments_tool(api_server_tools, query_engine_tools)
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
            db_credentials = context_data.get("dbCredentials")
            request_session_id = data.get("session_id")
            browser_session_id = data.get("browser_session_id")

            if context_data and isinstance(context_data, dict):
                preamble = "Current UI Context:\n"
                if context_data.get("endpoint"):
                    preamble += f"- Database (Endpoint): {context_data['endpoint']}\n"
                if context_data.get("owner"):
                    preamble += f"- Schema (Owner): {context_data['owner']}\n"
                if context_data.get("objectType") and context_data.get("objectName"):
                    preamble += f"- Selected Object: {context_data['objectType']} {context_data['objectName']}\n"

                full_message = f"{preamble}\nUser Request: {message}"
            else:
                full_message = message

            content = types.Content(role="user", parts=[types.Part(text=full_message)])
            session_id = request_session_id or str(uuid.uuid4())

            async def stream_generator():
                queue = asyncio.Queue()
                
                # Initialize tokens to None to avoid UnboundLocalError in finally block
                session_token = None
                browser_session_token = None
                auth_token_token = None
                db_credentials_token = None
                ui_context_token = None
                progress_callback_token = None

                session_token = session_id_var.set(session_id)
                if browser_session_id:
                    browser_session_token = browser_session_id_var.set(browser_session_id)
                if auth_token:
                    auth_token_token = auth_token_var.set(auth_token)

                if db_credentials:
                    db_credentials_token = db_credentials_var.set(db_credentials)

                ui_context_token = ui_context_var.set(context_data if isinstance(context_data, dict) else {})

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
                    cancelled_var.set(True) # Signal cancellation to tools
                    # Safely reset context variables
                    if session_token:
                        session_id_var.reset(session_token)
                    if browser_session_token:
                        browser_session_id_var.reset(browser_session_token)
                    if auth_token_token:
                        auth_token_var.reset(auth_token_token)
                    if db_credentials_token:
                        db_credentials_var.reset(db_credentials_token)
                    if ui_context_token:
                        ui_context_var.reset(ui_context_token)
                    if progress_callback_token:
                        progress_callback_var.reset(progress_callback_token)
                    logger.info(f"Cleanup completed for session {session_id}")

            return StreamingResponse(stream_generator(), media_type="text/plain")

        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return JSONResponse(content={"error": str(e)}, status_code=500)

    logger.info("Starting Comment Generator Agent on port 10003...")
    uvicorn.run(app, host="0.0.0.0", port=10003)
