import os
import shutil
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from common.context import ui_context_var, progress_callback_var
from common.tools import (
    create_save_memory_tool,
    create_read_memory_tool,
    create_maintain_visulate_readme_tool,
    create_copy_artifact_to_repo_tool,
)
from schema_analysis_agent.agent import create_schema_analysis_agent
from object_analysis_agent.agent import create_object_analysis_agent


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
        assert "visulate-memory" in res

        mem_dir = os.path.join(base_dir, "visulate-memory")
        expected_path = os.path.join(mem_dir, "pdb21", "memories", "schema_rntmgr2_summary.md")
        assert os.path.exists(expected_path)
        # Application repo must remain untouched
        assert not os.path.exists(os.path.join(repo_dir, "visulate"))

        with open(expected_path, "r", encoding="utf-8") as f:
            saved_content = f.read()
        assert "Property management schema" in saved_content
        assert any("Architectural memory saved" in m for m in progress_messages)

        # Verify visulate-memory/README.md was automatically updated
        readme_path = os.path.join(mem_dir, "README.md")
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
        expected_path = os.path.join(base_dir, "visulate-memory", "pdb21", "structures", "rental_agreements.md")
        assert os.path.exists(expected_path)

        with open(expected_path, "r", encoding="utf-8") as f:
            saved_content = f.read()
        assert "Core table holding active and historical leases" in saved_content


@pytest.mark.asyncio
async def test_save_memory_record_without_linked_project(temp_repo):
    """Memory must persist into visulate-memory even when no app repository is linked."""
    base_dir, _, _ = temp_repo
    save_tool = create_save_memory_tool()

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        ui_context_var.set({"endpoint": "pdb21"})
        res = await save_tool.func(content="# Unlinked DB Memory\nCaptured without an app repo.")
        assert "Successfully saved" in res
        assert "visulate-memory" in res
        expected_path = os.path.join(base_dir, "visulate-memory", "pdb21", "memories", "architecture_summary.md")
        assert os.path.exists(expected_path)


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
        assert "copy_artifact_to_repo" in tool_names_root


@pytest.mark.asyncio
async def test_maintain_visulate_readme_tool(temp_repo):
    base_dir, project_id, _ = temp_repo
    tool = create_maintain_visulate_readme_tool()

    ui_ctx = {
        "projectId": project_id,
        "endpoint": "pdb21"
    }

    mem_dir = os.path.join(base_dir, "visulate-memory", "pdb21", "memories")
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
        assert "Successfully generated and updated `README.md`" in res
        assert any("Maintained README.md" in m for m in progress_messages)

        readme_file = os.path.join(base_dir, "visulate-memory", "README.md")
        assert os.path.exists(readme_file)
        with open(readme_file, "r", encoding="utf-8") as f:
            content = f.read()

        assert "System Overview" in content
        assert "Test architectural note." in content


@pytest.mark.asyncio
async def test_read_memory_record_and_legacy_fallback(temp_repo):
    base_dir, project_id, repo_dir = temp_repo
    read_tool = create_read_memory_tool()

    # Legacy file inside app repo
    legacy_dir = os.path.join(repo_dir, "visulate", "pdb21", "memories")
    os.makedirs(legacy_dir, exist_ok=True)
    with open(os.path.join(legacy_dir, "legacy_arch.md"), "w", encoding="utf-8") as f:
        f.write("# Legacy Arch\nStored inside app repo.")

    # Primary file inside visulate-memory
    mem_dir = os.path.join(base_dir, "visulate-memory", "pdb21", "memories")
    os.makedirs(mem_dir, exist_ok=True)
    with open(os.path.join(mem_dir, "architecture.md"), "w", encoding="utf-8") as f:
        f.write("# Architecture\nMicroservices with Oracle DB backend.")

    ui_ctx = {
        "projectId": project_id,
        "endpoint": "pdb21"
    }

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        ui_context_var.set(ui_ctx)

        content = await read_tool.func("architecture.md")
        assert "Microservices with Oracle DB backend" in content

        legacy_content = await read_tool.func("legacy_arch.md")
        assert "Stored inside app repo." in legacy_content

        missing = await read_tool.func("non_existent.md")
        assert "not found" in missing


@pytest.mark.asyncio
async def test_shared_memory_across_users_and_copy_to_repo():
    temp_dir = tempfile.mkdtemp()
    try:
        app_repo_dir = os.path.join(temp_dir, "rental-portal")
        os.makedirs(app_repo_dir, exist_ok=True)
        save_tool = create_save_memory_tool()
        read_tool = create_read_memory_tool()
        copy_tool = create_copy_artifact_to_repo_tool()

        with patch.dict(os.environ, {"GIT_REPOS_DIR": temp_dir, "GIT_MODE": "local"}):
            # Alice saves a memory
            ui_context_var.set({"endpoint": "pdb21", "username": "alice"})
            res = await save_tool.func(
                content="# Shared DB Notes\nShared across users.",
                filename="shared_notes.md",
                category="memories",
                description="Shared Notes"
            )
            assert "Successfully saved" in res

            # Bob reads the same shared memory
            ui_context_var.set({"endpoint": "pdb21", "username": "bob"})
            bob_content = await read_tool.func("shared_notes.md")
            assert "Shared across users." in bob_content

            # Copy artifact explicitly from visulate-memory to rental-portal
            copy_res = await copy_tool.func(
                source_path="pdb21/memories/shared_notes.md",
                target_repo="rental-portal",
                target_path="docs/shared_notes.md"
            )
            assert "Copied 1 file(s)" in copy_res
            assert os.path.exists(os.path.join(app_repo_dir, "docs", "shared_notes.md"))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.mark.asyncio
async def test_save_nl2sql_query_memory_for_postgres(temp_repo):
    from nl2sql_agent.agent import create_nl2sql_agent
    base_dir, _, _ = temp_repo
    save_tool = create_save_memory_tool()

    with patch("common.tools.get_mcp_toolsets", return_value=(MagicMock(), MagicMock())):
        nl2sql = create_nl2sql_agent()
        tool_names = [getattr(t, "name", "") for t in nl2sql.tools]
        assert "save_memory_record" in tool_names

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        # Even if UI context has no endpoint set, explicit database parameter routes to cmbs-postgres/queries/
        ui_context_var.set({})
        res = await save_tool.func(
            content="# Top Loans by Balance\nPostgreSQL query joining loans and properties.\n```sql\nSELECT l.id, p.name FROM public.loans l JOIN public.properties p ON p.id = l.property_id LIMIT 10;\n```",
            filename="top_loans_by_balance.md",
            category="queries",
            description="NL2SQL Query Pattern",
            database="cmbs-postgres"
        )
        assert "Successfully saved" in res
        expected_path = os.path.join(base_dir, "visulate-memory", "cmbs-postgres", "queries", "top_loans_by_balance.md")
        assert os.path.exists(expected_path)

        readme_path = os.path.join(base_dir, "visulate-memory", "README.md")
        with open(readme_path, "r", encoding="utf-8") as f:
            readme_text = f.read()
        assert "Saved SQL Queries & Patterns" in readme_text
        assert "top_loans_by_balance.md" in readme_text


def test_specialists_equipped_with_save_memory_and_readme_reads_central_code_map(temp_repo):
    from schema_comparison_agent.agent import create_schema_comparison_agent
    from invalid_objects.agent import create_invalid_objects_agent
    from app_developer.agent import create_app_developer_agent
    from readme_generator.generator import load_indexed_dependencies
    import json

    base_dir, project_id, repo_dir = temp_repo

    with patch("common.tools.get_mcp_toolsets", return_value=(MagicMock(), MagicMock())), \
         patch("schema_comparison_agent.agent.get_mcp_toolsets", return_value=(MagicMock(), MagicMock())), \
         patch("invalid_objects.agent.get_mcp_toolsets", return_value=(MagicMock(), MagicMock())), \
         patch("app_developer.agent.get_mcp_toolsets", return_value=(MagicMock(), MagicMock())):
        comp_agent = create_schema_comparison_agent()
        inv_agent = create_invalid_objects_agent()
        dev_agent = create_app_developer_agent()

        assert "save_memory_record" in [getattr(t, "name", "") for t in comp_agent.tools]
        assert "save_memory_record" in [getattr(t, "name", "") for t in inv_agent.tools]
        assert "save_memory_record" in [getattr(t, "name", "") for t in dev_agent.tools]
        assert "NEVER write `visulate/` memory files" in dev_agent.instruction

    # Verify readme_generator loads code maps from central visulate-memory/<db>/code-maps/<repo>/
    mem_code_map_dir = os.path.join(base_dir, "visulate-memory", "pdb21", "code-maps", project_id)
    os.makedirs(mem_code_map_dir, exist_ok=True)
    with open(os.path.join(mem_code_map_dir, "oracle-code-map.json"), "w", encoding="utf-8") as f:
        json.dump({
            "dbConnectionId": "pdb21",
            "objects": {"PR_PROPERTIES": {"owner": "RNTMGR2", "type": "TABLE", "files": ["src/props.js"]}},
            "files": {"src/props.js": ["PR_PROPERTIES"]}
        }, f)

    with patch.dict(os.environ, {"GIT_REPOS_DIR": base_dir}):
        deps = load_indexed_dependencies(repo_dir, "pdb21")
        assert deps["db_connection"] == "pdb21"
        assert "PR_PROPERTIES" in deps["objects"]
        assert deps["file_to_objects"].get("src/props.js") == ["PR_PROPERTIES"]


@pytest.mark.asyncio
async def test_security_and_scope_hardening():
    from common.config import get_default_memory_repo_name
    from readme_generator.generator import load_indexed_dependencies
    import json

    temp_dir = tempfile.mkdtemp()
    outside_dir = tempfile.mkdtemp()
    try:
        # 1. DEFAULT_MEMORY_REPO preserves valid names verbatim (including leading/trailing underscores)
        with patch.dict(os.environ, {"DEFAULT_MEMORY_REPO": "_team_mem_"}):
            assert get_default_memory_repo_name() == "_team_mem_"
        with patch.dict(os.environ, {"DEFAULT_MEMORY_REPO": ".."}):
            assert get_default_memory_repo_name() == "visulate-memory"

        save_tool = create_save_memory_tool()
        read_tool = create_read_memory_tool()
        copy_tool = create_copy_artifact_to_repo_tool()

        app_repo_dir = os.path.join(temp_dir, "target-app")
        os.makedirs(app_repo_dir, exist_ok=True)
        os.symlink(outside_dir, os.path.join(app_repo_dir, "docs_link"))

        with patch.dict(os.environ, {"GIT_REPOS_DIR": temp_dir, "GIT_MODE": "local"}):
            ui_context_var.set({"endpoint": "pdb21"})

            # 2. Reject dot-directory database identifiers in save_memory_record
            res_dotdot = await save_tool.func(content="# Bad", filename="bad.md", database="..")
            assert "Invalid database identifier" in res_dotdot
            assert not os.path.exists(os.path.join(temp_dir, "memories", "bad.md"))

            # Seed memory repo and test read_memory_record blocks .git/config, .conf, and symlinks
            res_ok = await save_tool.func(content="# Good", filename="good.md", database="pdb21")
            assert "Successfully saved" in res_ok
            mem_root = os.path.join(temp_dir, "visulate-memory")
            with open(os.path.join(mem_root, "ora2pg.conf"), "w", encoding="utf-8") as f:
                f.write("ORACLE_PWD secret\n")
            outside_secret = os.path.join(outside_dir, "secret.md")
            with open(outside_secret, "w", encoding="utf-8") as f:
                f.write("TOP SECRET")
            os.symlink(outside_secret, os.path.join(mem_root, "pdb21", "memories", "leak.md"))

            assert "Invalid memory record path" in await read_tool.func(".git/config")
            assert "Invalid memory record path" in await read_tool.func("ora2pg.conf")
            assert "Invalid memory record path" in await read_tool.func("pdb21/memories/leak.md")

            # 3. copy_artifact_to_repo rejects symlinked destination directories
            copy_err = await copy_tool.func(
                source_path="pdb21/memories/good.md",
                target_repo="target-app",
                target_path="docs_link/escaped.md"
            )
            assert "symbolic link" in copy_err.lower() or "escapes" in copy_err.lower()
            assert not os.path.exists(os.path.join(outside_dir, "escaped.md"))

        # 4. load_indexed_dependencies honors user scope when GIT_MODE=server & MEMORY_REPO_SCOPE=user
        user_repo_dir = os.path.join(temp_dir, "users", "alice", "my-app")
        user_mem_map_dir = os.path.join(temp_dir, "users", "alice", "visulate-memory", "pdb21", "code-maps", "my-app")
        os.makedirs(user_repo_dir, exist_ok=True)
        os.makedirs(user_mem_map_dir, exist_ok=True)
        with open(os.path.join(user_mem_map_dir, "oracle-code-map.json"), "w", encoding="utf-8") as f:
            json.dump({
                "dbConnectionId": "pdb21",
                "objects": {"ALICE_TBL": {"owner": "HR", "type": "TABLE", "files": ["a.sql"]}},
                "files": {"a.sql": ["ALICE_TBL"]}
            }, f)

        with patch.dict(os.environ, {"GIT_REPOS_DIR": temp_dir, "GIT_MODE": "server", "MEMORY_REPO_SCOPE": "user"}):
            deps = load_indexed_dependencies(user_repo_dir, "pdb21", username="alice")
            assert "ALICE_TBL" in deps["objects"]
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        shutil.rmtree(outside_dir, ignore_errors=True)

