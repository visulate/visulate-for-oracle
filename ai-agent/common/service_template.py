import logging
import asyncio
import json
from typing import Callable, Any
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from google.adk.runners import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents import RunConfig, LlmAgent
from google.adk.agents.run_config import StreamingMode
from google.genai import types
from common.context import progress_callback_var, session_id_var, auth_token_var, cancelled_var, cancelled_sessions, ui_context_var, db_credentials_var

logger = logging.getLogger(__name__)
def create_agent_app(agent_factory: Callable[[], LlmAgent], agent_name: str) -> FastAPI:
    """Creates a FastAPI app for a standalone agent."""
    app = FastAPI()
    agent = agent_factory()
    session_service = InMemorySessionService()
    runner = Runner(app_name=agent_name, agent=agent, session_service=session_service)

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

        async def response_generator():
            queue = asyncio.Queue()
            loop = asyncio.get_event_loop()
            # Set up context variables
            session_token = session_id_var.set(session_id)
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
                        await session_service.get_session(user_id="visulate_user", session_id=session_id)
                    except Exception:
                        await session_service.create_session(
                            app_name=agent_name,
                            user_id="visulate_user",
                            session_id=session_id
                        )

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
                    async for event in runner.run_async(
                        user_id="visulate_user",
                        session_id=session_id,
                        new_message=content
                    ):
                        logger.info(f"Sub-agent Event: {type(event)}")
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
                                elif part.function_response:
                                    logger.info(f"Sub-agent Part Function Response: {part.function_response.name}")
                                else:
                                    logger.info(f"Sub-agent Part Other: {part}")
                        else:
                            logger.info(f"Sub-agent Event Content Empty. Event: {event}")
                except Exception as e:
                    logger.error(f"Error in {agent_name} execution: {e}", exc_info=True)
                    await queue.put(f"▌ERROR: {str(e)}\n")
                finally:
                    logger.info(f"Sub-agent {agent_name} run_agent task finishing")
                    await queue.put(None)

            agent_task = asyncio.create_task(run_agent())

            try:
                while True:
                    if await request.is_disconnected():
                        logger.info(f"Client disconnected for session {session_id}. Cancelling task.")
                        cancelled_sessions.add(session_id)
                        cancelled_var.set(True)
                        agent_task.cancel()
                        break

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

                await agent_task
            finally:
                if not agent_task.done():
                    agent_task.cancel()

                # Cleanup context variables
                session_id_var.reset(session_token)
                if auth_token_token:
                    auth_token_var.reset(auth_token_token)
                ui_context_var.reset(ui_context_token)
                progress_callback_var.reset(progress_callback_token)

        return StreamingResponse(response_generator(), media_type="text/plain")

    return app
