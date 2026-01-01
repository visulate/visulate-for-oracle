import logging
import httpx
import json
import asyncio
from typing import Dict, Any
from google.adk.tools.function_tool import FunctionTool
from common.context import progress_callback_var, session_id_var, auth_token_var, ui_context_var, db_credentials_var

logger = logging.getLogger(__name__)

def create_remote_delegate_tool(agent_name: str, endpoint_url: str) -> FunctionTool:
    """Creates a tool that delegates to a remote agent service and relays progress."""

    async def _delegate(message: str) -> str:
        """Sends a request to a specialized sub-agent and relays its progress updates."""
        # Get session ID and auth token from context
        session_id = session_id_var.get() or "default"
        auth_token = auth_token_var.get()
        db_credentials = db_credentials_var.get()
        ui_context = ui_context_var.get() or {}

        # Ensure context has the latest auth info
        if auth_token:
            ui_context["authToken"] = auth_token
        if db_credentials:
            ui_context["dbCredentials"] = db_credentials

        logger.info(f"Delegating to {agent_name} at {endpoint_url} (Session: {session_id})")
        # Mask sensitive context data for logging
        masked_context = {k: (v if v is None or k not in ['authToken', 'dbCredentials'] else '***') for k, v in ui_context.items()}
        logger.info(f"Context passed to sub-agent: {masked_context}")

        full_response = []
        progress_callback = progress_callback_var.get()

        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{endpoint_url}/agent/generate",
                    json={
                        "message": message,
                        "session_id": session_id,
                        "context": ui_context
                    }
                ) as response:
                    async for chunk in response.aiter_bytes():
                        if not chunk:
                            continue

                        chunk_str = chunk.decode('utf-8', errors='ignore')
                        # Check for progress updates in the chunk
                        if "▌" in chunk_str:
                            lines = chunk_str.split('\n')
                            for line in lines:
                                if line.startswith("▌"):
                                    logger.info(f"Relaying progress from {agent_name}: {line.strip()}")
                                    if progress_callback:
                                        clean_msg = line.replace("▌STATUS: ", "").replace("▌ERROR: ", "").replace("▌SUCCESS: ", "").strip()
                                        progress_callback(clean_msg)
                                elif line.strip():
                                    full_response.append(line + "\n")
                        else:
                            full_response.append(chunk_str)

        except Exception as e:
            error_msg = f"Error calling {agent_name}: {str(e)}"
            logger.error(error_msg)
            return error_msg

        final_result = "".join(full_response).strip()
        logger.info(f"Received final response from {agent_name} (length: {len(final_result)})")
        return final_result

    # Give the tool a descriptive name based on the agent it calls
    _delegate.__name__ = f"delegate_to_{agent_name}"
    _delegate.__doc__ = f"Delegates complex tasks to the {agent_name}. Use this for specialized processing."

    return FunctionTool(_delegate)
