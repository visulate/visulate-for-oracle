import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

def test_health_endpoint(client):
    """Test the health check endpoint."""
    response = client.get("/agent/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "agent": "visulate_root_agent"}

@patch("google.adk.runners.Runner.run_async")
def test_generate_endpoint(mock_run, client):
    """Test the generate endpoint with a mocked agent run."""
    # Mock the streaming event response
    mock_event = MagicMock()
    mock_event.content.parts = [MagicMock(text="Hello from agent")]
    mock_event.get_function_calls.return_value = []
    mock_event.get_function_responses.return_value = []
    mock_event.finish_reason = None

    async def mock_run_async(*args, **kwargs):
        yield mock_event

    mock_run.side_effect = mock_run_async

    response = client.post(
        "/agent/generate",
        json={
            "message": "hi",
            "context": {"session_id": "test-session"}
        }
    )

    assert response.status_code == 200
    assert mock_run.called

@patch("google.adk.runners.Runner.run_async")
def test_generate_with_context(mock_run, client):
    """Test that context is correctly parsed and used."""
    # Mock an async generator
    async def mock_run_async(*args, **kwargs):
        mock_event = MagicMock()
        mock_event.content.parts = [MagicMock(text="test response")]
        mock_event.get_function_calls.return_value = []
        mock_event.get_function_responses.return_value = []
        mock_event.finish_reason = None
        yield mock_event

    mock_run.side_effect = mock_run_async

    payload = {
        "message": "test context",
        "context": {
            "session_id": "session-123",
            "authToken": "{\"db\": \"creds\"}"
        }
    }

    # We expect a streaming response
    with client.stream("POST", "/agent/generate", json=payload) as response:
        assert response.status_code == 200
        # Check if we get some data
        it = response.iter_lines()
        content = next(it)
        assert content is not None

@patch("google.adk.runners.Runner.run_async")
def test_error_message_formatting_with_error_prefix(mock_run, client):
    """Test that error messages with ▌ERROR: prefix are correctly formatted."""
    # Mock an async generator that returns a function call and response followed by empty synthesis
    async def mock_run_async(*args, **kwargs):
        # First turn: tool call
        mock_event1 = MagicMock()
        mock_function_call = MagicMock()
        mock_function_call.name = "delegate_to_test_agent"
        mock_event1.content.parts = [
            MagicMock(text=None, function_call=mock_function_call, function_response=None)
        ]
        mock_event1.get_function_calls.return_value = [mock_function_call]
        mock_event1.get_function_responses.return_value = []
        mock_event1.finish_reason = None
        yield mock_event1
        
        # Tool response
        mock_event2 = MagicMock()
        mock_response = MagicMock()
        mock_response.name = "delegate_to_test_agent"
        mock_response.response = "▌ERROR: Database connection failed"
        mock_event2.content.parts = [
            MagicMock(text=None, function_call=None, function_response=mock_response)
        ]
        mock_event2.get_function_calls.return_value = []
        mock_event2.get_function_responses.return_value = [mock_response]
        mock_event2.finish_reason = None
        yield mock_event2

        # Second turn (synthesis)
        mock_event3 = MagicMock()
        mock_event3.content.parts = []
        mock_event3.get_function_calls.return_value = []
        mock_event3.get_function_responses.return_value = []
        mock_event3.finish_reason = None
        yield mock_event3

    mock_run.side_effect = mock_run_async

    payload = {
        "message": "test error",
        "context": {"session_id": "test-session"}
    }

    with client.stream("POST", "/agent/generate", json=payload) as response:
        assert response.status_code == 200
        # Collect all response content
        content = b"".join(response.iter_bytes()).decode('utf-8')
        # Should contain error header
        assert "### Error from Test Agent" in content
        # Should contain error message with prefix stripped
        assert "Error: Database connection failed" in content
        # Should not contain the ▌ERROR: prefix in user-facing output
        assert "▌ERROR:" not in content

@patch("google.adk.runners.Runner.run_async")
def test_generic_error_when_no_text_and_no_tool_result(mock_run, client):
    """Test generic error message when both text_parts_seen and last_tool_result are absent."""
    # Mock an async generator that returns no text and no tool results
    async def mock_run_async(*args, **kwargs):
        # Event with empty content
        mock_event = MagicMock()
        mock_event.content = None
        mock_event.get_function_calls.return_value = []
        mock_event.get_function_responses.return_value = []
        mock_event.finish_reason = None
        yield mock_event

    mock_run.side_effect = mock_run_async

    payload = {
        "message": "test no response",
        "context": {"session_id": "test-session"}
    }

    with client.stream("POST", "/agent/generate", json=payload) as response:
        assert response.status_code == 200
        content = b"".join(response.iter_bytes()).decode('utf-8')
        # Should contain generic error message
        assert "I'm sorry, I encountered an internal error and couldn't generate a response" in content

@patch("google.adk.runners.Runner.run_async")
def test_normal_result_with_result_header(mock_run, client):
    """Test that normal results are displayed correctly with the Result header."""
    # Mock an async generator that returns a function call and response followed by synthesis text
    async def mock_run_async(*args, **kwargs):
        # First turn
        mock_event1 = MagicMock()
        mock_function_call = MagicMock()
        mock_function_call.name = "delegate_to_erd_agent"
        mock_event1.content.parts = [
            MagicMock(text=None, function_call=mock_function_call, function_response=None)
        ]
        mock_event1.get_function_calls.return_value = [mock_function_call]
        mock_event1.get_function_responses.return_value = []
        mock_event1.finish_reason = None
        yield mock_event1
        
        mock_event2 = MagicMock()
        mock_response = MagicMock()
        mock_response.name = "delegate_to_erd_agent"
        mock_response.response = "Here is the ERD diagram data"
        mock_event2.content.parts = [
            MagicMock(text=None, function_call=None, function_response=mock_response)
        ]
        mock_event2.get_function_calls.return_value = []
        mock_event2.get_function_responses.return_value = [mock_response]
        mock_event2.finish_reason = None
        yield mock_event2

        # Second turn
        mock_event3 = MagicMock()
        mock_event3.content.parts = [MagicMock(text="Analyzed results")]
        mock_event3.get_function_calls.return_value = []
        mock_event3.get_function_responses.return_value = []
        mock_event3.finish_reason = None
        yield mock_event3

    mock_run.side_effect = mock_run_async

    payload = {
        "message": "show erd",
        "context": {"session_id": "test-session"}
    }

    with client.stream("POST", "/agent/generate", json=payload) as response:
        assert response.status_code == 200
        content = b"".join(response.iter_bytes()).decode('utf-8')
        # The synthesis turn (mock_event3) yielded "Analyzed results"
        assert "Analyzed results" in content
