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
