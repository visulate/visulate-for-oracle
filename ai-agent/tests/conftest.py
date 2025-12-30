import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from root_agent.main import create_app
from common.context import session_id_var, auth_token_var, progress_callback_var

@pytest.fixture
def mock_genai_client():
    """Mock the Google GenAI client to avoid actual API calls."""
    with patch("google.genai.Client") as mock:
        mock_instance = MagicMock()
        mock.return_value = mock_instance
        yield mock_instance

@pytest.fixture
def mock_runner():
    """Mock the ADK Runner."""
    with patch("google.adk.runners.Runner.run_async") as mock_run:
        mock_run.return_value = AsyncMock()
        yield mock_run

@pytest.fixture
def client():
    """Test client for the Root Agent FastAPI app."""
    app = create_app()
    return TestClient(app)

@pytest.fixture(autouse=True)
def clean_context():
    """Reset context variables before each test."""
    session_id_var.set(None)
    auth_token_var.set(None)
    progress_callback_var.set(None)
    yield
