import logging
import asyncio
import json
from typing import Callable, Any
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from google.adk.runners import Runner
from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.agents import RunConfig, LlmAgent
from google.adk.agents.run_config import StreamingMode
from google.genai import types
from common.context import progress_callback_var, session_id_var, browser_session_id_var, auth_token_var, cancelled_var, cancelled_sessions, ui_context_var, db_credentials_var, timeout_signal_var
from common.utils import format_tool_name
from common.config import get_ai_timeout
import time

from google.adk.flows.llm_flows.auto_flow import AutoFlow
from google.adk.utils.context_utils import Aclosing

import importlib.metadata
import os

# No monkeypatch needed. 

logger = logging.getLogger(__name__)
def create_agent_app(agent_factory: Callable[[], LlmAgent], agent_name: str) -> FastAPI:
    """Creates a FastAPI app for a standalone agent."""
    app = FastAPI()
    agent = agent_factory()
    session_service = DatabaseSessionService(db_url="sqlite+aiosqlite:///sessions.db")
    runner = Runner(app_name="visulate_agent", agent=agent, session_service=session_service)

    from common.utils import setup_session_db
    @app.on_event("startup")
    async def startup_event():
        await setup_session_db()

    @app.get("/agent/health")
    async def health():
        return {"status": "ok", "agent": agent_name}

    @app.post("/agent/generate")
    async def generate(request: Request):
        data = await request.json()
        message = data.get("message", "")
        context_data = data.get("context", {})
        auth_token = context_data.get("authToken")
        db_credentials = context_data.get("dbCredentials")
        session_id = data.get("session_id", "default")
        browser_session_id = data.get("browser_session_id")

        async def response_generator():
            queue = asyncio.Queue()
            loop = asyncio.get_event_loop()
            # Set up context variables
            session_token = session_id_var.set(session_id)
            browser_session_token = None
            if browser_session_id:
                browser_session_token = browser_session_id_var.set(browser_session_id)

            auth_token_token = None
            if auth_token:
                auth_token_token = auth_token_var.set(auth_token)

            db_credentials_token = None
            if db_credentials:
                db_credentials_token = db_credentials_var.set(db_credentials)

            ui_context_token = ui_context_var.set(context_data if isinstance(context_data, dict) else {})

            def progress_callback(msg):
                try:
                    loop.call_soon_threadsafe(queue.put_nowait, f"▌STATUS: {msg}\n")
                except Exception as e:
                    logger.error(f"Error in progress callback: {e}")

            progress_callback_token = progress_callback_var.set(progress_callback)

            async def run_agent():
                try:
                    # Ensure session exists in this standalone service
                    try:
                        session = await session_service.get_session(app_name="visulate_agent", user_id="visulate_user", session_id=session_id)
                        if session is None:
                            await session_service.create_session(
                                app_name="visulate_agent",
                                user_id="visulate_user",
                                session_id=session_id
                            )
                    except Exception as e:
                        logger.error(f"Error handling session creation: {e}")

                    if context_data and isinstance(context_data, dict):
                        preamble = "Current UI Context:\n"
                        if context_data.get("endpoint"):
                            preamble += f"- Database (Endpoint): {context_data['endpoint']}\n"
                        if context_data.get("owner"):
                            preamble += f"- Schema (Owner): {context_data['owner']}\n"
                        if context_data.get("objectType") and context_data.get("objectName"):
                            preamble += f"- Selected Object: {context_data['objectType']} {context_data['objectName']}\n"
                        if context_data.get("filter"):
                            preamble += f"- Active Filter: {context_data['filter']}\n"
                        if context_data.get("objectList") and isinstance(context_data.get("objectList"), list):
                            obj_list = context_data['objectList']
                            if len(obj_list) > 20:
                                preamble += f"- Object List: {', '.join(obj_list[:20])} ... ({len(obj_list)} total)\n"
                            else:
                                preamble += f"- Object List: {', '.join(obj_list)}\n"
                        if context_data.get("currentObject"):
                            preamble += f"- Selected Object Details: {json.dumps(context_data['currentObject'])}\n"

                        full_message = f"{preamble}\nUser Request: {message}"
                    else:
                        full_message = message

                    agent_message = types.Content(role="user", parts=[types.Part(text=full_message)])
                    run_config = RunConfig(streaming_mode=StreamingMode.SSE)

                    async for event in runner.run_async(
                        user_id="visulate_user",
                        session_id=session_id,
                        new_message=agent_message,
                        run_config=run_config
                    ):
                         if event.get_function_calls() or event.get_function_responses():
                             has_tool_call = True
                         
                         logger.info(f"Sub-agent Event: {type(event)}")
                         if event.finish_reason:
                              logger.info(f"Sub-agent Finish Reason: {event.finish_reason}")

                         if event.content and event.content.parts:
                             for part in event.content.parts:
                                 if part.text is not None:
                                     if part.text:
                                         logger.info(f"Sub-agent Part Text: {len(part.text)} chars")
                                         await queue.put(part.text)
                                     else:
                                          logger.info("Sub-agent Part Text: Empty string")
                                 elif part.function_call:
                                     logger.info(f"Sub-agent Part Function Call: {part.function_call.name}")
                                     if part.function_call.name == "report_progress":
                                         msg = part.function_call.args.get("message", "")
                                         if msg:
                                             logger.info(f"Yielding Progress: ▌STATUS: {msg}")
                                             # Ensure progress is on its own line for easier parsing
                                             await queue.put(f"\n▌STATUS: {msg}\n")
                                     else:
                                         readable_name = format_tool_name(part.function_call.name)
                                         await queue.put(f"▌STATUS: Executing {readable_name}...\n")
                                 elif part.function_response:
                                     logger.info(f"Sub-agent Part Function Response: {part.function_response.name}")
                                     readable_name = format_tool_name(part.function_response.name)
                                     await queue.put(f"▌STATUS: {readable_name} completed, generating response...\n")
                                 else:
                                     logger.info(f"Sub-agent Part Other: {part}")
                         else:
                             # Log more detail for empty content events
                             logger.info(f"Sub-agent Event (Empty Content): finish_reason={event.finish_reason}, error_code={getattr(event, 'error_code', 'N/A')}")
                             if event.finish_reason == types.FinishReason.MALFORMED_FUNCTION_CALL:
                                 await queue.put("▌ERROR: The agent's function call was rejected by the LLM backend (MALFORMED_FUNCTION_CALL).\n")
                except Exception as e:
                    logger.error(f"Error in {agent_name} execution: {e}", exc_info=True)
                    await queue.put(f"▌ERROR: {str(e)}\n")
                finally:
                    logger.info(f"Sub-agent {agent_name} run_agent task finishing")
                    await queue.put(None)

            agent_task = asyncio.create_task(run_agent())

            start_time = time.time()
            timeout_limit = get_ai_timeout()
            is_timeout = False

            try:
                while True:
                    if await request.is_disconnected():
                        logger.info(f"Client disconnected for session {session_id}. Cancelling task.")
                        cancelled_sessions.add(session_id)
                        cancelled_var.set(True)
                        agent_task.cancel()
                        break

                    # Check for internal timeout
                    elapsed = time.time() - start_time
                    if elapsed > timeout_limit and not is_timeout:
                        is_timeout = True
                        logger.warning(f"Timeout limit reached ({timeout_limit}s) for session {session_id}. Triggering wrap-up.")
                        yield f"▌STATUS: Processing limit reached ({timeout_limit}s). Wrapping up current progress...\n"
                        cancelled_sessions.add(session_id)
                        timeout_signal_var.set(True)
                        # We don't set cancelled_var because we want tools to finish gracefully

                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=1.0)
                        if item is None:
                            logger.info("Queue returned None, ending response stream")
                            break
                        if item.startswith("▌"):
                             logger.info(f"Yielding Progress: {item.strip()}")
                        else:
                             logger.info(f"Yielding Text Chunk: {len(item)} chars")
                        yield item
                    except asyncio.TimeoutError:
                        yield " " # Heartbeat
                        continue

                if is_timeout:
                    yield "\n\n**Note:** I've reached the processing time limit for this request. I have provided the results generated so far. Please review them and ask me to 'continue' if you would like me to finish the remaining tasks."

                # Safety: Wait for the agent task to finish gracefully after timeout
                try:
                    await asyncio.wait_for(agent_task, timeout=10.0)
                except asyncio.TimeoutError:
                    logger.warning(f"Agent task for session {session_id} did not finish within 10s safety window. Cancelling hard.")
                    agent_task.cancel()
                    try:
                        await agent_task
                    except asyncio.CancelledError:
                        pass
            finally:
                if not agent_task.done():
                    agent_task.cancel()

                # Cleanup context variables
                session_id_var.reset(session_token)
                if auth_token_token:
                    auth_token_var.reset(auth_token_token)
                if db_credentials_token:
                    db_credentials_var.reset(db_credentials_token)
                ui_context_var.reset(ui_context_token)
                progress_callback_var.reset(progress_callback_token)

        return StreamingResponse(response_generator(), media_type="text/plain")

    return app
