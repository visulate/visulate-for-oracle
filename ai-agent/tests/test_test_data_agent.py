import pytest
import os
from unittest.mock import MagicMock, patch
from test_data_generator.agent import create_test_data_generator_agent

def test_test_data_generator_agent_creation():
    """Test that the Test Data Generator agent can be created with the correct tools."""
    agent = create_test_data_generator_agent()
    assert agent.name == "test_data_generator_agent"

    tool_names = [getattr(tool, 'name', None) for tool in agent.tools]
    assert "report_progress" in tool_names
    assert "save_test_data" in tool_names

@pytest.mark.asyncio
@patch("test_data_generator.agent.session_id_var")
@patch("test_data_generator.agent.report_progress")
@patch("os.makedirs")
async def test_save_test_data(mock_makedirs, mock_report, mock_session_id):
    """Test the save_test_data tool."""
    from test_data_generator.agent import save_test_data

    mock_session_id.get.return_value = "test-session"

    files = [
        {"filename": "test_data.sql", "content": "INSERT INTO T1 VALUES (1);"},
        {"filename": "test_data.csv", "content": "1,test"},
        {"filename": "test_data.ctl", "content": "LOAD DATA..."}
    ]

    with patch("builtins.open", MagicMock()) as mock_file_open:
        result = await save_test_data(files)

        assert "Successfully generated test data files" in result
        assert "[test_data.sql]" in result
        assert "[test_data.csv]" in result
        assert "[test_data.ctl]" in result
        assert "/download/test-session/test_data.sql" in result

        assert mock_file_open.call_count == 3
        mock_report.assert_called()
