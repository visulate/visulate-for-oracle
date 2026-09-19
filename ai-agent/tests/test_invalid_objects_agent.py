import pytest
from unittest.mock import MagicMock, patch
from invalid_objects.agent import create_invalid_objects_agent

def test_invalid_objects_agent_creation():
    """Test that the Invalid Objects agent can be created with the correct tools."""
    agent = create_invalid_objects_agent()
    assert agent.name == "invalid_objects_agent"

    # McpToolset doesn't have a .name attribute directly
    tool_names = [getattr(tool, 'name', None) for tool in agent.tools]
    assert "report_progress" in tool_names
    assert "save_remediation_script" in tool_names

@pytest.mark.asyncio
@patch("invalid_objects.agent.session_id_var")
@patch("invalid_objects.agent.report_progress")
@patch("os.makedirs")
async def test_save_remediation_script(mock_makedirs, mock_report, mock_session_id):
    """Test the save_remediation_script function."""
    from invalid_objects.agent import save_remediation_script

    mock_session_id.get.return_value = "test-session"

    # We need to mock open individually
    with patch("builtins.open", MagicMock()) as mock_file_open:
        result = await save_remediation_script(
            database="testdb",
            schema="testuser",
            sql_content="ALTER PACKAGE PKG1 COMPILE;",
            plan_name="fix_pkg1"
        )

        assert "Successfully generated remediation script" in result
        assert "[Download SQL Script]" in result
        assert "/download/test-session/fix_pkg1_testuser_testdb_" in result

        mock_file_open.assert_called()
        mock_report.assert_called()

@pytest.mark.asyncio
@patch("invalid_objects.agent.session_id_var")
@patch("invalid_objects.agent.ui_context_var")
@patch("invalid_objects.agent.resolve_repo_for_db")
@patch("invalid_objects.agent.report_progress")
@patch("os.makedirs")
async def test_save_remediation_script_with_repo(mock_makedirs, mock_report, mock_resolve_repo, mock_ui_ctx, mock_session_id):
    """Test save_remediation_script when an associated repository exists."""
    from invalid_objects.agent import save_remediation_script

    mock_session_id.get.return_value = "test-session"
    mock_ui_ctx.get.return_value = {"projectId": "my-repo"}
    mock_resolve_repo.return_value = ("my-repo", "/fake/repos/my-repo")

    with patch("builtins.open", MagicMock()) as mock_file_open:
        result = await save_remediation_script(
            database="testdb",
            schema="testuser",
            sql_content="ALTER PACKAGE PKG1 COMPILE;",
            plan_name="fix_pkg1"
        )

        assert "Successfully generated remediation script" in result
        assert "saved to repository `my-repo`" in result
        assert "visulate/testdb/remediation/fix_pkg1_testuser_testdb_" in result
        assert "[Download SQL Script]" not in result
        mock_file_open.assert_called()
        mock_report.assert_called()

