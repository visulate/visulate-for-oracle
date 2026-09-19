import pytest
from unittest.mock import MagicMock, patch
from erd_agent.agent import create_erd_agent

@pytest.fixture
def agent():
    return create_erd_agent()

@pytest.mark.asyncio
async def test_erd_agent_tools(agent):
    """Verify the agent has the correct tools registered."""
    tool_names = [getattr(tool, 'name', '') for tool in agent.tools]
    assert "report_progress" in tool_names
    assert "generate_erd_file" in tool_names

    # Check if MCP toolset is present
    has_mcp = any("McpToolset" in str(type(tool)) for tool in agent.tools)
    assert has_mcp

def test_erd_agent_identity(agent):
    """Verify agent name and instructions."""
    assert agent.name == "erd_agent"
    assert "Visulate ERD Generation Agent" in agent.instruction

@pytest.mark.asyncio
@patch("erd_agent.agent.resolve_repo_for_db", return_value=(None, None))
@patch("erd_agent.agent.session_id_var")
@patch("erd_agent.agent.report_progress")
@patch("os.makedirs")
async def test_generate_erd_file_no_repo(mock_makedirs, mock_report, mock_session_id, mock_resolve_repo):
    from erd_agent.agent import generate_erd_file
    mock_session_id.get.return_value = "test-session"

    with patch("builtins.open", MagicMock()), \
         patch("erd_agent.agent.DiagramGenerator") as mock_gen_cls:
        mock_gen = MagicMock()
        mock_gen.to_xml.return_value = "<mxGraphModel></mxGraphModel>"
        mock_gen_cls.return_value = mock_gen

        res = await generate_erd_file("pdb21", "HR", '[{"name": "EMPLOYEES", "type": "TABLE"}]', "[]", "[]", "HR Diagram")
        assert "Successfully generated ERD for HR" in res
        assert "[Download Draw.io File]" in res
        assert "/download/test-session/" in res

@pytest.mark.asyncio
@patch("erd_agent.agent.session_id_var")
@patch("erd_agent.agent.ui_context_var")
@patch("erd_agent.agent.resolve_repo_for_db")
@patch("erd_agent.agent.report_progress")
@patch("os.makedirs")
async def test_generate_erd_file_with_repo(mock_makedirs, mock_report, mock_resolve_repo, mock_ui_ctx, mock_session_id):
    from erd_agent.agent import generate_erd_file
    mock_session_id.get.return_value = "test-session"
    mock_ui_ctx.get.return_value = {"projectId": "hr-project"}
    mock_resolve_repo.return_value = ("hr-project", "/fake/repos/hr-project")

    with patch("builtins.open", MagicMock()), \
         patch("erd_agent.agent.DiagramGenerator") as mock_gen_cls:
        mock_gen = MagicMock()
        mock_gen.to_xml.return_value = "<mxGraphModel></mxGraphModel>"
        mock_gen_cls.return_value = mock_gen

        res = await generate_erd_file("pdb21", "HR", '[{"name": "EMPLOYEES", "type": "TABLE"}]', "[]", "[]", "HR Diagram")
        assert "Successfully generated ERD for HR" in res
        assert "saved to repository `hr-project`" in res
        assert "visulate/pdb21/erd/HR_Diagram_HR_pdb21_" in res
        assert "[Download Draw.io File]" not in res
