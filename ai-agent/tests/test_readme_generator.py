import os
import tempfile
import shutil
import json
import pytest
from unittest.mock import MagicMock, patch

from readme_generator.generator import (
    build_directory_tree_bottom_up,
    load_indexed_dependencies,
    generate_readme_for_directory,
    run_bottom_up_readme_generation
)
from readme_generator.agent import create_readme_generator_agent


@pytest.fixture
def temp_repo():
    """Sets up a temporary git repository fixture with nested directories, files, and an existing README."""
    tmp = tempfile.mkdtemp()
    try:
        # Create nested folders:
        # root /
        #   src /
        #     services /
        #       billing /
        #         invoice.js
        #         payment.sql
        #         README.md (existing)
        #       auth /
        #         login.js
        #     models /
        #       user.js
        #   visulate /
        #     pdb21 /
        #       oracle-code-map.json
        #   node_modules / (should be ignored)
        #     bad.js
        #   .git / (should be ignored)
        #     config

        billing_dir = os.path.join(tmp, "src", "services", "billing")
        auth_dir = os.path.join(tmp, "src", "services", "auth")
        models_dir = os.path.join(tmp, "src", "models")
        visulate_dir = os.path.join(tmp, "visulate", "pdb21")
        ignored_nm = os.path.join(tmp, "node_modules", "pkg")
        ignored_git = os.path.join(tmp, ".git")

        for d in [billing_dir, auth_dir, models_dir, visulate_dir, ignored_nm, ignored_git]:
            os.makedirs(d, exist_ok=True)

        # Create files
        with open(os.path.join(billing_dir, "invoice.js"), "w", encoding="utf-8") as f:
            f.write("// Invoice service queries RNT_INVOICES\nfunction getInvoice() {}\n")

        with open(os.path.join(billing_dir, "payment.sql"), "w", encoding="utf-8") as f:
            f.write("SELECT * FROM RNT_PAYMENTS WHERE id = :id;\n")

        # Existing README to verify and update
        with open(os.path.join(billing_dir, "README.md"), "w", encoding="utf-8") as f:
            f.write("# Billing Module\nLegacy notes: handles invoices and payment processing.\n")

        with open(os.path.join(auth_dir, "login.js"), "w", encoding="utf-8") as f:
            f.write("function login(user, pass) {}\n")

        with open(os.path.join(models_dir, "user.js"), "w", encoding="utf-8") as f:
            f.write("class User {}\n")

        with open(os.path.join(tmp, "app.js"), "w", encoding="utf-8") as f:
            f.write("console.log('App root');\n")

        # Ignored files
        with open(os.path.join(ignored_nm, "bad.js"), "w", encoding="utf-8") as f:
            f.write("// should be ignored\n")

        # Dependency map
        code_map = {
            "projectId": "test-repo",
            "dbConnectionId": "pdb21",
            "objects": {
                "RNT_INVOICES": {
                    "owner": "RNTMGR2",
                    "type": "TABLE",
                    "files": ["src/services/billing/invoice.js"]
                },
                "RNT_PAYMENTS": {
                    "owner": "RNTMGR2",
                    "type": "TABLE",
                    "files": ["src/services/billing/payment.sql"]
                }
            },
            "files": {
                "src/services/billing/invoice.js": ["RNT_INVOICES"],
                "src/services/billing/payment.sql": ["RNT_PAYMENTS"]
            }
        }
        with open(os.path.join(visulate_dir, "oracle-code-map.json"), "w", encoding="utf-8") as f:
            json.dump(code_map, f, indent=2)

        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_build_directory_tree_bottom_up(temp_repo):
    dirs = build_directory_tree_bottom_up(temp_repo)
    assert len(dirs) > 0

    # Leaf directories (billing, auth, models) should come before parent directories (services, src, root)
    rel_paths = [d['rel_path'].replace("\\", "/") for d in dirs]

    # Verify ignored directories are not in list
    assert not any("node_modules" in p for p in rel_paths)
    assert not any(".git" in p for p in rel_paths)
    assert not any("visulate" in p for p in rel_paths)

    # Verify billing and auth come before services and src
    assert "src/services/billing" in rel_paths
    assert "src/services/auth" in rel_paths
    assert "src/services" in rel_paths
    assert "src" in rel_paths
    assert "" in rel_paths  # Root

    idx_billing = rel_paths.index("src/services/billing")
    idx_services = rel_paths.index("src/services")
    idx_src = rel_paths.index("src")
    idx_root = rel_paths.index("")

    # Deepest first (bottom-up)
    assert idx_billing < idx_services < idx_src < idx_root

    # Verify existing README is detected for billing
    billing_info = next(d for d in dirs if d['rel_path'].replace("\\", "/") == "src/services/billing")
    assert billing_info['has_existing_readme'] is True
    assert "Legacy notes" in billing_info['existing_readme']
    assert "invoice.js" in billing_info['files']
    assert "payment.sql" in billing_info['files']


def test_load_indexed_dependencies(temp_repo):
    deps = load_indexed_dependencies(temp_repo, "pdb21")
    assert "RNT_INVOICES" in deps["objects"]
    assert "RNT_PAYMENTS" in deps["objects"]
    assert "src/services/billing/invoice.js" in deps["file_to_objects"]
    assert deps["file_to_objects"]["src/services/billing/invoice.js"] == ["RNT_INVOICES"]


@pytest.mark.asyncio
async def test_generate_readme_with_existing_verification(temp_repo):
    dirs = build_directory_tree_bottom_up(temp_repo)
    deps = load_indexed_dependencies(temp_repo, "pdb21")

    billing_info = next(d for d in dirs if d['rel_path'].replace("\\", "/") == "src/services/billing")

    content, summary = await generate_readme_for_directory(
        repo_path=temp_repo,
        dir_info=billing_info,
        dep_info=deps,
        child_summaries={},
        genai_client=None  # Test deterministic fallback verification
    )

    # Must contain database dependencies and verification notes
    assert "RNT_INVOICES" in content
    assert "RNT_PAYMENTS" in content
    assert "invoice.js" in content
    assert "payment.sql" in content
    assert "Legacy notes" in content  # Preserved from existing README
    assert "Verified & Updated Content" in content


@pytest.mark.asyncio
async def test_run_bottom_up_readme_generation(temp_repo):
    progress_messages = []

    def on_progress(msg: str):
        progress_messages.append(msg)

    result = await run_bottom_up_readme_generation(
        repo_path=temp_repo,
        db_endpoint="pdb21",
        progress_callback=on_progress,
        genai_client=None
    )

    assert result["processed_count"] >= 5
    assert len(result["created"]) >= 4
    assert len(result["updated"]) >= 1  # billing had existing README

    # Verify files exist on disk
    root_readme = os.path.join(temp_repo, "README.md")
    billing_readme = os.path.join(temp_repo, "src", "services", "billing", "README.md")
    services_readme = os.path.join(temp_repo, "src", "services", "README.md")

    assert os.path.exists(root_readme)
    assert os.path.exists(billing_readme)
    assert os.path.exists(services_readme)

    with open(billing_readme, "r", encoding="utf-8") as f:
        billing_content = f.read()
    assert "RNT_INVOICES" in billing_content

    # Check progress stream was reported
    assert any("Scanning repository" in m for m in progress_messages)
    assert any("README generation complete" in m for m in progress_messages)


@pytest.mark.asyncio
async def test_run_bottom_up_scoped_and_cancellation(temp_repo):
    # Test scoping to specific subtree
    result = await run_bottom_up_readme_generation(
        repo_path=temp_repo,
        db_endpoint="pdb21",
        target_subpath="src/services/billing",
        genai_client=None
    )
    assert result["processed_count"] == 1
    assert result["details"][0]["path"] == "src/services/billing/README.md"

    # Test cancellation stop
    cancelled_result = await run_bottom_up_readme_generation(
        repo_path=temp_repo,
        db_endpoint="pdb21",
        genai_client=None,
        is_cancelled=lambda: True
    )
    assert cancelled_result["processed_count"] == 0


def test_create_readme_generator_agent():
    agent = create_readme_generator_agent()
    assert agent.name == "readme_generator_agent"
    tool_names = [t.name for t in agent.tools if hasattr(t, "name")]
    assert "generate_all_readmes" in tool_names
    assert "validate_or_update_directory_readme" in tool_names
    assert "scan_readme_status" in tool_names
