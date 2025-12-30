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
