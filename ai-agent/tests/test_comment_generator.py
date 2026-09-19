import pytest
import os
import json
from unittest.mock import MagicMock, AsyncMock, patch
from comment_generator.main import CommentGenerator, MCPClient
from google.adk.tools.mcp_tool import McpToolset

@pytest.mark.asyncio
async def test_comment_generator_init_fix():
    """Regression test for 'MCPClient' object has no attribute 'config'"""

    # Mocking McpToolset
    api_tools = MagicMock(spec=McpToolset)
    qe_tools = MagicMock(spec=McpToolset)

    # Initialize MCPClient (without config attribute)
    client = MCPClient(api_tools, qe_tools, session_id="test-session")

    # Mock GOOGLE_API_KEY for genai.Client
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "test-key-123"}):
        with patch("google.genai.Client") as mock_genai:
            generator = CommentGenerator(
                mcp_client=client,
                database="pdb23",
                schema="RNTMGR2"
            )

            assert generator.database == "pdb23"
            assert generator.schema == "RNTMGR2"
            # Verify it didn't crash and tried to initialize genai.Client with correct key
            mock_genai.assert_called_with(api_key="test-key-123")

@pytest.mark.asyncio
async def test_mcp_client_call_api_server_tool_unwrapping():
    """Test that _unwrap_result correctly handles string errors from MCP tools."""
    api_tools = MagicMock(spec=McpToolset)
    qe_tools = MagicMock(spec=McpToolset)
    client = MCPClient(api_tools, qe_tools)

    # Simulate a ToolResponse object as returned by ADK
    class MockToolResponse:
        def model_dump(self):
            return {
                "isError": True,
                "content": [{"type": "text", "text": "Invalid or expired credential token"}]
            }

    with patch.object(client, "_call_mcp_tool", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = MockToolResponse()

        result = await client.call_api_server_tool("any_tool", {})

        # Verify it was unwrapped into a dictionary
        assert isinstance(result, dict)
        assert result["success"] is False
        assert result["error"] == "Invalid or expired credential token"

@pytest.mark.asyncio
async def test_comment_generator_run_no_objects(tmp_path):
    """Test CommentGenerator.run when no objects are missing comments."""
    api_tools = MagicMock(spec=McpToolset)
    qe_tools = MagicMock(spec=McpToolset)
    client = MCPClient(api_tools, qe_tools)

    generator = CommentGenerator(client, "db", "user")

    # Mock get_objects_missing_comments to return empty lists
    with patch.object(client, "call_api_server_tool", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = {"tables": [], "columns": []}

        output_file = tmp_path / "test.sql"
        # Patch CredentialManager to return a fake password so it doesn't stop at the interactive prompt
        with patch('comment_generator.main.CredentialManager.get_password', return_value=('fake_pass', 'test-source', 'user')):
            # Also mock token creation
            with patch.object(generator, "create_credential_token", new_callable=AsyncMock) as mock_token:
                mock_token.return_value = True
                
                count = await generator.run(wildcard="%", output_file=str(output_file))
                assert count == 0
        mock_call.assert_awaited()

@pytest.mark.asyncio
@patch("pathlib.Path.mkdir")
@patch("comment_generator.agent.session_id_var")
@patch("comment_generator.agent.ui_context_var")
@patch("comment_generator.agent.resolve_repo_for_db")
@patch("comment_generator.agent.progress_callback_var")
@patch("comment_generator.agent.MCPClient")
@patch("comment_generator.agent.CommentGenerator")
async def test_generate_comments_tool_with_repo(mock_gen_cls, mock_mcp, mock_prog, mock_resolve_repo, mock_ui_ctx, mock_session_id, mock_mkdir):
    from comment_generator.agent import create_generate_comments_tool
    mock_session_id.get.return_value = "test-session"
    mock_ui_ctx.get.return_value = {"projectId": "comments-repo"}
    mock_resolve_repo.return_value = ("comments-repo", "/fake/repos/comments-repo")

    mock_gen = AsyncMock()
    mock_gen.run.return_value = 5
    mock_gen_cls.return_value = mock_gen

    tool = create_generate_comments_tool(MagicMock(), MagicMock())
    result = await tool.func("db1", "schema1")

    assert "Saved comments to repository `comments-repo`" in result
    assert "visulate/db1/comments/comments_db1_schema1.sql" in result
    assert "[Download SQL]" not in result
    assert "SUCCESS: Generated 5 comments." in result
