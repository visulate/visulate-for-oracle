import os
import shutil
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from common.context import ui_context_var, progress_callback_var
from common.tools import create_save_memory_tool
from schema_analysis_agent.agent import create_schema_analysis_agent
from object_analysis_agent.agent import create_object_analysis_agent
from root_agent.agent import create_root_agent

@pytest.fixture
def temp_repo():
    temp_dir = tempfile.mkdtemp()
    repo_dir = os.path.join(temp_dir, "test-repo")
    os.makedirs(repo_dir, exist_ok=True)
    yield temp_dir, "test-repo", repo_dir
    shutil.rmtree(temp_dir, ignore_errors=True)

@pytest.mark.asyncio
async def test_save_memory_record_schema_summary(temp_repo):
    base_dir, project_id, repo_dir = temp_repo
    save_tool = create_save_memory_tool()

    ui_ctx = {
        "projectId": project_id,
        "endpoint": "pdb21",
        "owner": "RNTMGR2"
    }

    progress_messages = []
    def mock_progress(msg):
        progress_messages.append(msg)

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        ui_context_var.set(ui_ctx)
        progress_callback_var.set(mock_progress)

        res = await save_tool.func(
            content="# Schema RNTMGR2\nProperty management schema supporting leases and tenants.",
            filename="schema_rntmgr2_summary.md",
            category="memories",
            description="Schema Functional Summary"
        )

        assert "Successfully saved" in res
        expected_path = os.path.join(repo_dir, "visulate", "pdb21", "memories", "schema_rntmgr2_summary.md")
        assert os.path.exists(expected_path)

        with open(expected_path, "r", encoding="utf-8") as f:
            saved_content = f.read()
        assert "Property management schema" in saved_content
        assert any("Architectural memory saved" in m for m in progress_messages)

        # Verify visulate/README.md was automatically updated
        readme_path = os.path.join(repo_dir, "visulate", "README.md")
        assert os.path.exists(readme_path)
        with open(readme_path, "r", encoding="utf-8") as f:
            readme_text = f.read()
        assert "Visulate Architectural Knowledge Base" in readme_text
        assert "pdb21" in readme_text
        assert "schema_rntmgr2_summary.md" in readme_text
        assert "Schema RNTMGR2" in readme_text

@pytest.mark.asyncio
async def test_save_memory_record_object_structure(temp_repo):
    base_dir, project_id, repo_dir = temp_repo
    save_tool = create_save_memory_tool()

    ui_ctx = {
        "projectId": project_id,
        "endpoint": "pdb21",
        "owner": "RNTMGR2",
        "objectName": "RENTAL_AGREEMENTS"
    }

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        ui_context_var.set(ui_ctx)

        res = await save_tool.func(
            content="# Table RENTAL_AGREEMENTS\nCore table holding active and historical leases.",
            category="structures"
        )

        assert "Successfully saved" in res
        expected_path = os.path.join(repo_dir, "visulate", "pdb21", "structures", "rental_agreements.md")
        assert os.path.exists(expected_path)

        with open(expected_path, "r", encoding="utf-8") as f:
            saved_content = f.read()
        assert "Core table holding active and historical leases" in saved_content

@pytest.mark.asyncio
async def test_save_memory_record_no_project():
    save_tool = create_save_memory_tool()
    ui_context_var.set({"endpoint": "pdb21"})

    res = await save_tool.func(content="Some architectural memory")
    assert "No active Git repository linked" in res

def test_agents_equipped_with_memory_tool():
    with patch("common.tools.get_mcp_urls", return_value=("http://localhost:3000", "http://localhost:3001")):
        schema_agent = create_schema_analysis_agent()
        tool_names_schema = [getattr(t, "name", "") for t in schema_agent.tools]
        assert "save_memory_record" not in tool_names_schema

        obj_agent = create_object_analysis_agent()
        tool_names_obj = [getattr(t, "name", "") for t in obj_agent.tools]
        assert "save_memory_record" not in tool_names_obj

@pytest.mark.asyncio
async def test_root_agent_has_memory_tools():
    from root_agent.agent import create_root_agent
    with patch("common.tools.get_mcp_toolsets") as mock_toolsets:
        mock_toolsets.return_value = (MagicMock(), MagicMock())
        root = create_root_agent()
        tool_names_root = [getattr(t, "name", "") for t in root.tools]
        assert "save_memory_record" in tool_names_root
        assert "read_memory_record" in tool_names_root
        assert "maintain_visulate_readme" in tool_names_root

@pytest.mark.asyncio
async def test_maintain_visulate_readme_tool(temp_repo):
    from common.tools import create_maintain_visulate_readme_tool
    base_dir, project_id, repo_dir = temp_repo
    tool = create_maintain_visulate_readme_tool()

    ui_ctx = {
        "projectId": project_id,
        "endpoint": "pdb21"
    }

    # Populate a memory file in the repository
    mem_dir = os.path.join(repo_dir, "visulate", "pdb21", "memories")
    os.makedirs(mem_dir, exist_ok=True)
    with open(os.path.join(mem_dir, "overview.md"), "w", encoding="utf-8") as f:
        f.write("# System Overview\nCore microservices architecture.\n")

    progress_messages = []
    def mock_prog(msg):
        progress_messages.append(msg)

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        ui_context_var.set(ui_ctx)
        progress_callback_var.set(mock_prog)

        res = await tool.func(notes="Test architectural note.")
        assert "Successfully generated and updated `visulate/README.md`" in res
        assert any("Maintained visulate/README.md" in m for m in progress_messages)

        readme_file = os.path.join(repo_dir, "visulate", "README.md")
        assert os.path.exists(readme_file)
        with open(readme_file, "r", encoding="utf-8") as f:
            content = f.read()

        assert "System Overview" in content
        assert "Test architectural note." in content

@pytest.mark.asyncio
async def test_read_memory_record(temp_repo):
    from common.tools import create_read_memory_tool
    base_dir, project_id, repo_dir = temp_repo
    read_tool = create_read_memory_tool()

    mem_dir = os.path.join(repo_dir, "visulate", "pdb21", "memories")
    os.makedirs(mem_dir, exist_ok=True)
    with open(os.path.join(mem_dir, "architecture.md"), "w", encoding="utf-8") as f:
        f.write("# Architecture\nMicroservices with Oracle DB backend.")

    ui_ctx = {
        "projectId": project_id,
        "endpoint": "pdb21"
    }

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        ui_context_var.set(ui_ctx)

        # Read by filename
        content = await read_tool.func("architecture.md")
        assert "Microservices with Oracle DB backend" in content

        # Read non-existent
        missing = await read_tool.func("non_existent.md")
        assert "not found" in missing

@pytest.mark.asyncio
async def test_save_and_read_memory_record_server_mode_tenant():
    from common.tools import create_read_memory_tool
    temp_dir = tempfile.mkdtemp()
    try:
        user_repo_dir = os.path.join(temp_dir, "users", "alice", "tenant-repo")
        os.makedirs(user_repo_dir, exist_ok=True)
        save_tool = create_save_memory_tool()
        read_tool = create_read_memory_tool()

        ui_ctx = {
            "projectId": "tenant-repo",
            "endpoint": "pdb21",
            "username": "alice"
        }

        with patch.dict(os.environ, {"GIT_REPOS_DIR": temp_dir, "GIT_MODE": "server"}):
            ui_context_var.set(ui_ctx)

            # 1. Save in server mode under users/alice/
            res = await save_tool.func(
                content="# Alice's Private Notes\nTenant isolated memory.",
                filename="alice_notes.md",
                category="memories",
                description="Alice Notes"
            )
            assert "Successfully saved" in res
            expected_file = os.path.join(user_repo_dir, "visulate", "pdb21", "memories", "alice_notes.md")
            assert os.path.exists(expected_file)

            # 2. Read back in server mode
            content = await read_tool.func("alice_notes.md")
            assert "Alice's Private Notes" in content

            # 3. Another user cannot see alice's repo
            ui_context_var.set({
                "projectId": "tenant-repo",
                "endpoint": "pdb21",
                "username": "bob"
            })
            bob_content = await read_tool.func("alice_notes.md")
            assert "not found" in bob_content
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

