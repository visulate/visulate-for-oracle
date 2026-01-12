import pytest
import asyncio
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from root_agent.remote_tool import create_remote_delegate_tool
from common.context import progress_callback_var, session_id_var

@pytest.mark.asyncio
async def test_remote_delegate_tool_success():
    """Test successful delegation to a sub-agent."""
    agent_name = "test_agent"
    endpoint = "http://localhost:9999"
    tool = create_remote_delegate_tool(agent_name, endpoint)

    # Mock progress callback
    progress_msgs = []
    def mock_callback(msg):
        progress_msgs.append(msg)

    progress_callback_var.set(mock_callback)
    session_id_var.set("test-session")

    # Mock httpx.AsyncClient.stream
    mock_response = MagicMock()

    async def mock_aiter_bytes():
        # Simulate progress update and then final result
        yield b"\xe2\x96\x8cSTATUS: Working...\n" # ▌STATUS: Working...
        yield b"Final result text"

    mock_response.aiter_bytes = mock_aiter_bytes
    mock_response.__aenter__.return_value = mock_response

    with patch("httpx.AsyncClient.stream", return_value=mock_response):
        # FunctionTool wraps the function; we call it via __call__ or access the internal fn
        # In ADK, FunctionTool is typically called via await tool.run(...) or just tool(...)
        # let's try direct call if it's async
        result = await tool.func("hello")

        assert "Final result text" in result
        assert "Working..." in progress_msgs

@pytest.mark.asyncio
async def test_remote_delegate_tool_error():
    """Test error handling in delegation."""
    agent_name = "test_agent"
    endpoint = "http://localhost:9999"
    tool = create_remote_delegate_tool(agent_name, endpoint)

    with patch("httpx.AsyncClient.stream", side_effect=Exception("Connection failed")):
        result = await tool.func("hello")
        assert "Error calling test_agent: Connection failed" in result

@pytest.mark.asyncio
async def test_heartbeat_filtering():
    """Test that heartbeat messages (single spaces for keep-alive) are correctly filtered out."""
    agent_name = "test_agent"
    endpoint = "http://localhost:9999"
    tool = create_remote_delegate_tool(agent_name, endpoint)

    progress_msgs = []
    def mock_callback(msg):
        progress_msgs.append(msg)

    progress_callback_var.set(mock_callback)
    session_id_var.set("test-session")

    mock_response = MagicMock()

    async def mock_aiter_bytes():
        # Simulate heartbeat (single space), progress update, and final result
        yield b" "  # Heartbeat - should be filtered out
        yield b"\xe2\x96\x8cSTATUS: Processing...\n"  # ▌STATUS: Processing...
        yield b" "  # Another heartbeat - should be filtered out
        yield b"Actual result"
        yield b" "  # Final heartbeat - should be filtered out

    mock_response.aiter_bytes = mock_aiter_bytes
    mock_response.__aenter__.return_value = mock_response

    with patch("httpx.AsyncClient.stream", return_value=mock_response):
        result = await tool.func("test message")

        # Heartbeats should not appear in final response
        assert result == "Actual result"
        # Heartbeats should not trigger progress callbacks
        assert "Processing..." in progress_msgs
        # Only one progress message should be captured
        assert len(progress_msgs) == 1

@pytest.mark.asyncio
async def test_error_message_capture():
    """Test that ERROR messages with ▌ERROR: prefix are properly captured in the return value."""
    agent_name = "test_agent"
    endpoint = "http://localhost:9999"
    tool = create_remote_delegate_tool(agent_name, endpoint)

    progress_msgs = []
    def mock_callback(msg):
        progress_msgs.append(msg)

    progress_callback_var.set(mock_callback)
    session_id_var.set("test-session")

    mock_response = MagicMock()

    async def mock_aiter_bytes():
        # Simulate an error response
        yield b"\xe2\x96\x8cERROR: Database connection failed\n"  # ▌ERROR: Database connection failed
        yield b"Additional error details"

    mock_response.aiter_bytes = mock_aiter_bytes
    mock_response.__aenter__.return_value = mock_response

    with patch("httpx.AsyncClient.stream", return_value=mock_response):
        result = await tool.func("test message")

        # Error message should be captured in the return value for LLM processing
        assert "▌ERROR: Database connection failed" in result
        assert "Additional error details" in result
        # Error should also trigger progress callback (with prefix stripped)
        assert "Database connection failed" in progress_msgs
