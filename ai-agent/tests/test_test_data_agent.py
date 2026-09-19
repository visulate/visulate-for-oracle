import pytest
import os
from unittest.mock import MagicMock, patch
from test_data_generator.agent import create_test_data_generator_agent

import pytest
import os
from unittest.mock import MagicMock, patch, AsyncMock
from test_data_generator.agent import create_test_data_generator_agent

def test_test_data_generator_agent_creation():
    """Test that the Test Data Generator agent can be created with the correct tools."""
    agent = create_test_data_generator_agent()
    assert agent.name == "test_data_generator_agent"

    tool_names = [getattr(tool, 'name', None) for tool in agent.tools]
    assert "report_progress" in tool_names
    assert "list_tables" in tool_names
    assert "generate_test_data_suite" in tool_names

@pytest.mark.asyncio
@patch("test_data_generator.agent.session_id_var")
@patch("test_data_generator.agent.progress_callback_var")
@patch("test_data_generator.agent.create_zip_archive")
@patch("test_data_generator.agent.TestDataGenerator")
@patch("os.makedirs")
async def test_generate_test_data_suite(mock_makedirs, mock_generator_class, mock_zip, mock_progress, mock_session_id):
    """Test the generate_test_data_suite tool."""
    from test_data_generator.agent import generate_test_data_suite

    mock_session_id.get.return_value = "test-session"

    # Mock the generator instance
    mock_generator = AsyncMock()
    mock_generator.run.return_value = {
        "files": ["table1.csv", "table1.ctl", "table1.dat"],
        "errors": []
    }
    mock_generator_class.return_value = mock_generator

    # Mock zip creation
    mock_zip.return_value = "/path/to/test_data.zip"

    result = await generate_test_data_suite("DB1", "SCHEMA1", ["TABLE1"])

    assert "Successfully generated test data for 1 tables" in result
    assert "Download All Files (Zip)" in result
    assert "table1.csv" in result
    assert "table1.ctl" in result
    assert "table1.dat" in result

    mock_generator.run.assert_called_once()
    mock_zip.assert_called_once()

@pytest.mark.asyncio
@patch("test_data_generator.agent.session_id_var")
@patch("test_data_generator.agent.ui_context_var")
@patch("test_data_generator.agent.resolve_repo_for_db")
@patch("test_data_generator.agent.progress_callback_var")
@patch("test_data_generator.agent.create_zip_archive")
@patch("test_data_generator.agent.TestDataGenerator")
@patch("os.makedirs")
async def test_generate_test_data_suite_with_repo(mock_makedirs, mock_generator_class, mock_zip, mock_progress, mock_resolve_repo, mock_ui_ctx, mock_session_id):
    """Test generate_test_data_suite when an associated repository exists."""
    from test_data_generator.agent import generate_test_data_suite

    mock_session_id.get.return_value = "test-session"
    mock_ui_ctx.get.return_value = {"projectId": "test-data-repo"}
    mock_resolve_repo.return_value = ("test-data-repo", "/fake/repos/test-data-repo")

    mock_generator = AsyncMock()
    mock_generator.run.return_value = {
        "files": ["table1.csv", "table1.ctl"],
        "errors": []
    }
    mock_generator_class.return_value = mock_generator

    result = await generate_test_data_suite("DB1", "SCHEMA1", ["TABLE1"])

    assert "Successfully generated test data for 1 tables" in result
    assert "saved to repository `test-data-repo`" in result
    assert "visulate/db1/test-data/SCHEMA1" in result
    assert "Download All Files (Zip)" not in result

    mock_generator.run.assert_called_once()
    mock_zip.assert_not_called()
