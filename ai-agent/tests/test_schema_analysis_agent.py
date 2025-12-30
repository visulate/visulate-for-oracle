import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from schema_analysis_agent.agent import create_schema_analysis_agent

@pytest.fixture
def agent():
    return create_schema_analysis_agent()

@pytest.mark.asyncio
async def test_schema_analysis_agent_tools(agent):
    """Verify the agent has the correct tools registered."""
    # report_progress is a FunctionTool which has a 'name' attribute
    # api_server_tools is an MCPToolset which might not have a 'name' attribute directly
    has_progress_tool = any(getattr(tool, 'name', '') == "report_progress" for tool in agent.tools)
    assert has_progress_tool

@patch("common.tools.get_mcp_toolsets")
@pytest.mark.asyncio
async def test_schema_analysis_logic(mock_get_mcp, agent):
    """Test the agent's logic (mocking the runner/model)."""
    # This is more of an ADK test, but we want to ensure it's configured right.
    assert agent.name == "schema_analysis_agent"
    assert "Visulate Schema Analysis Agent" in agent.instruction
