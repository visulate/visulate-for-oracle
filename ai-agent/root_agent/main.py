import logging
import os
import uuid
import json
import asyncio
from typing import Dict, Any, AsyncGenerator

from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from google.genai import types

from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents import RunConfig, LlmAgent
from google.adk.agents.run_config import StreamingMode

# Import from common module
from common.config import get_mcp_urls
from common.context import session_id_var, auth_token_var, progress_callback_var, cancelled_var
# Import Root Agent factory from local agent.py
from root_agent.agent import create_root_agent

logger = logging.getLogger(__name__)
logging.basicConfig(format="[%(levelname)s]: %(message)s", level=logging.INFO)

load_dotenv()

def create_app() -> FastAPI:
    """Creates and configures the FastAPI application."""

    # Initialize Root Agent and Runner
    root_agent = create_root_agent()
    session_service = InMemorySessionService()

    runner = Runner(
        app_name="visulate_agent",
        agent=root_agent,
        session_service=session_service
    )

    app = FastAPI()

    @app.get("/agent/health")
    async def health_check():
        """Health check endpoint to confirm agent availability."""
        return {"status": "ok", "agent": "visulate_root_agent"}

    @app.post("/agent/generate")
    async def generate(request: Request):
        try:
            data = await request.json()
            message = data.get("message", "")
            context = data.get("context", {})
            if isinstance(context, str) and context.strip():
                try:
                    context = json.loads(context)
                except Exception as e:
                    logger.warning(f"Failed to parse context string: {e}")

            auth_token = None
            if isinstance(context, dict):
                # Prioritize dbCredentials (JSON containing all authorized databases) over a single authToken
                auth_token = context.get("dbCredentials") or context.get("authToken")

            # Construct prompt with context if available
            prompt_text = message
            if context:
                 context_str = json.dumps(context) if isinstance(context, dict) else str(context)
                 prompt_text = f"{message}\n\nContext:\n{context_str}"

            content = types.Content(role="user", parts=[types.Part(text=prompt_text)])
            # Determine session ID: use data.get("session_id"), or context.get("session_id"), or generate new
            session_id = data.get("session_id")
            if not session_id and isinstance(context, dict):
                session_id = context.get("session_id")

            if not session_id:
                session_id = str(uuid.uuid4())

            # Ensure Session exists
            try:
                await session_service.get_session(user_id="visulate_user", session_id=session_id)
            except Exception:
                await session_service.create_session(
                    app_name="visulate_agent",
                    user_id="visulate_user",
                    session_id=session_id
                )

            async def response_generator() -> AsyncGenerator[str, None]:
                queue = asyncio.Queue()
                loop = asyncio.get_running_loop()
                session_token = session_id_var.set(session_id)
                auth_token_token = None
                if auth_token:
                    auth_token_token = auth_token_var.set(auth_token)

                def progress_callback(msg):
                    try:
                        loop.call_soon_threadsafe(queue.put_nowait, f"▌STATUS: {msg}\n")
                    except Exception as e:
                        logger.error(f"Error in progress callback: {e}")

                progress_callback_token = progress_callback_var.set(progress_callback)

                async def run_agent():
                    try:
                        async for event in runner.run_async(
                            user_id="visulate_user",
                            session_id=session_id,
                            new_message=content
                        ):
                            logger.info(f"Root Agent Event: {type(event)}")
                            if event.content and event.content.parts:
                                for part in event.content.parts:
                                    if part.text:
                                        logger.info(f"Root Agent Part Text: {len(part.text)} chars")
                                        await queue.put(part.text)
                                    elif part.function_call:
                                        logger.info(f"Root Agent Part Function Call: {part.function_call.name}")
                                    elif part.function_response:
                                        logger.info(f"Root Agent Part Function Response: {part.function_response.name}")
                                    else:
                                        logger.info(f"Root Agent Part Other: {part}")
                            else:
                                logger.info("Root Agent Event Content Empty")
                    except Exception as e:
                        logger.error(f"Error during agent execution: {e}", exc_info=True)
                        await queue.put(f"▌ERROR: {str(e)}\n")
                    finally:
                        logger.info(f"Root Agent run_agent task finishing")
                        await queue.put(None)

                agent_task = asyncio.create_task(run_agent())

                try:
                    while True:
                        if await request.is_disconnected():
                            logger.info(f"Client disconnected for session {session_id}. Cancelling agent task.")
                            from common.context import cancelled_sessions
                            cancelled_sessions.add(session_id)
                            cancelled_var.set(True)
                            agent_task.cancel()
                            break

                        try:
                            item = await asyncio.wait_for(queue.get(), timeout=1.0)
                            if item is None:
                                break
                            yield item
                        except asyncio.TimeoutError:
                            yield " "
                            continue

                    await agent_task
                finally:
                    if not agent_task.done():
                        agent_task.cancel()
                    session_id_var.reset(session_token)
                    if auth_token_token:
                        auth_token_var.reset(auth_token_token)
                    progress_callback_var.reset(progress_callback_token)

            return StreamingResponse(response_generator(), media_type="text/plain")

        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return JSONResponse(content={"error": str(e)}, status_code=500)

    return app

def main():
    app = create_app()
    logger.info("Starting Visulate Root Agent on port 10000...")
    uvicorn.run(app, host="0.0.0.0", port=10000)

if __name__ == "__main__":
    main()
