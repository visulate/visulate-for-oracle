import os
import shutil
import tempfile
import pytest
from unittest.mock import MagicMock, patch
from common.service_template import get_okf_context

@pytest.fixture
def temp_repo_dir(monkeypatch):
    temp_dir = tempfile.mkdtemp()
    monkeypatch.setenv("GIT_REPOS_DIR", temp_dir)
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_get_okf_context_visulate_dir(temp_repo_dir):
    proj_dir = os.path.join(temp_repo_dir, "my-repo", "visulate", "dev")
    os.makedirs(os.path.join(proj_dir, "memories"), exist_ok=True)
    os.makedirs(os.path.join(proj_dir, "structures"), exist_ok=True)

    with open(os.path.join(proj_dir, "codebase-dependencies.md"), "w", encoding="utf-8") as f:
        f.write("# Dependencies\n- EMP mapped to emp.sql\n")

    with open(os.path.join(proj_dir, "memories", "decisions.md"), "w", encoding="utf-8") as f:
        f.write("# Architectural Decision\nUse PL/SQL packages for core business logic.\n")

    with open(os.path.join(proj_dir, "structures", "emp_pkg.md"), "w", encoding="utf-8") as f:
        f.write("# Structure of EMP_PKG\nHandles employee onboarding.\n")

    result = get_okf_context("my-repo", "dev")
    assert "Visulate Architectural Memory & Dependency Map" in result
    assert "Repository: my-repo, Database: dev" in result
    assert "codebase-dependencies.md" in result
    assert "decisions.md" in result
    assert "emp_pkg.md" in result
    assert "Use PL/SQL packages for core business logic." in result

def test_get_okf_context_database_striping(temp_repo_dir):
    repo_base = os.path.join(temp_repo_dir, "my-repo", "visulate")
    dev_dir = os.path.join(repo_base, "dev", "memories")
    prod_dir = os.path.join(repo_base, "prod", "memories")
    os.makedirs(dev_dir, exist_ok=True)
    os.makedirs(prod_dir, exist_ok=True)

    with open(os.path.join(dev_dir, "note.md"), "w", encoding="utf-8") as f:
        f.write("DEV MEMORY: active debug logging enabled")

    with open(os.path.join(prod_dir, "note.md"), "w", encoding="utf-8") as f:
        f.write("PROD MEMORY: strict production mode")

    dev_context = get_okf_context("my-repo", "dev")
    assert "DEV MEMORY" in dev_context
    assert "PROD MEMORY" not in dev_context

    prod_context = get_okf_context("my-repo", "prod")
    assert "PROD MEMORY" in prod_context
    assert "DEV MEMORY" not in prod_context

@patch("google.adk.runners.Runner.run_async")
def test_root_agent_injects_repository_and_memory(mock_run, client, temp_repo_dir):
    proj_dir = os.path.join(temp_repo_dir, "app-repo", "visulate", "pdb21", "memories")
    os.makedirs(proj_dir, exist_ok=True)
    with open(os.path.join(proj_dir, "rules.md"), "w", encoding="utf-8") as f:
        f.write("System Rule: Table names must be pluralized.")

    captured_prompt = []

    async def mock_run_async(*args, **kwargs):
        new_msg = kwargs.get("new_message")
        if new_msg and new_msg.parts:
            captured_prompt.append(new_msg.parts[0].text)
        mock_event = MagicMock()
        mock_event.content.parts = [MagicMock(text="Acknowledged memory.")]
        mock_event.get_function_calls.return_value = []
        mock_event.get_function_responses.return_value = []
        mock_event.finish_reason = None
        yield mock_event

    mock_run.side_effect = mock_run_async

    response = client.post(
        "/agent/generate",
        json={
            "message": "Create a new table for customers",
            "context": {
                "projectId": "app-repo",
                "endpoint": "pdb21"
            }
        }
    )

    assert response.status_code == 200
    assert len(captured_prompt) > 0
    prompt = captured_prompt[0]
    assert "- Selected Repository: app-repo" in prompt
    assert "Visulate Architectural Memory & Dependency Map" in prompt
    assert "System Rule: Table names must be pluralized." in prompt

def test_get_okf_context_tiered_priority_and_budget(temp_repo_dir):
    proj_dir = os.path.join(temp_repo_dir, "tiered-repo", "visulate", "pdb21")
    mem_dir = os.path.join(proj_dir, "memories")
    struct_dir = os.path.join(proj_dir, "structures")
    os.makedirs(mem_dir, exist_ok=True)
    os.makedirs(struct_dir, exist_ok=True)

    # Active object structure (tier 1)
    with open(os.path.join(struct_dir, "orders.md"), "w", encoding="utf-8") as f:
        f.write("# ORDERS Table Structure\nPrimary sales order table.")

    # Other object structure
    with open(os.path.join(struct_dir, "customers.md"), "w", encoding="utf-8") as f:
        f.write("# CUSTOMERS Table Structure\nCustomer accounts.")

    # Active schema summary (tier 2)
    with open(os.path.join(mem_dir, "schema_sales_summary.md"), "w", encoding="utf-8") as f:
        f.write("# SALES Schema Summary\nCore ordering and invoicing system.")

    # Other schema summary
    with open(os.path.join(mem_dir, "schema_hr_summary.md"), "w", encoding="utf-8") as f:
        f.write("# HR Schema Summary\nHuman resources system.")

    # Set a tiny budget of 70 bytes so only tier 1 fits and the rest are placed in the manifest
    result = get_okf_context(
        project_id="tiered-repo",
        db_endpoint="pdb21",
        active_owner="SALES",
        active_object="ORDERS",
        max_budget_bytes=70
    )

    # Active object must be injected in full
    assert "ORDERS Table Structure" in result

    # Lower priority items must be summarized in the Additional Available Memory Records manifest
    assert "Additional Available Memory Records (query via read_memory_record tool):" in result
    assert "customers.md" in result or "schema_sales_summary.md" in result
    assert "read_memory_record" in result


def test_get_okf_context_server_mode_tenant(temp_repo_dir, monkeypatch):
    monkeypatch.setenv("GIT_MODE", "server")
    user_repo = os.path.join(temp_repo_dir, "users", "tenant_user", "tenant-project", "visulate", "dev", "memories")
    os.makedirs(user_repo, exist_ok=True)

    with open(os.path.join(user_repo, "tenant_rules.md"), "w", encoding="utf-8") as f:
        f.write("# Tenant Specific Rules\nMust use tenant partitioned storage.")

    # 1. Calling without tenant username returns empty (not found)
    res_no_tenant = get_okf_context("tenant-project", "dev")
    assert res_no_tenant == ""

    # 2. Calling with correct tenant username finds and loads the context
    res_tenant = get_okf_context("tenant-project", "dev", username="tenant_user")
    assert "Must use tenant partitioned storage" in res_tenant

    # 3. Calling with a different user does not load tenant_user's repo
    res_other = get_okf_context("tenant-project", "dev", username="other_user")
    assert res_other == ""

