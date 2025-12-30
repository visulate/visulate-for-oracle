import os
import json
import pytest
from unittest.mock import patch, MagicMock
from common.credentials import CredentialManager
from common.context import auth_token_var

def test_credential_manager_env_fallback():
    """Test that CredentialManager falls back to env variables."""
    manager = CredentialManager()
    with patch.dict(os.environ, {"DB_PASSWORD_PDB21_RNTMGR2": "env_password"}):
        password = manager.get_password("pdb21", "RNTMGR2")
        assert password == "env_password"

def test_credential_manager_token_priority():
    """Test that auth_token_var has priority over env variables."""
    manager = CredentialManager()
    token_creds = {
        "pdb21": {
            "username": "RNTMGR2",
            "password": "token_password"
        }
    }

    auth_token_var.set(json.dumps(token_creds))

    with patch.dict(os.environ, {"DB_PASSWORD_PDB21_RNTMGR2": "env_password"}):
        password = manager.get_password("pdb21", "RNTMGR2")
        assert password == "token_password"

def test_credential_manager_case_insensitivity():
    """Test that DB and Schema names are handled correctly regardless of case."""
    manager = CredentialManager()
    with patch.dict(os.environ, {"DB_PASSWORD_PDB21_RNTMGR2": "case_password"}):
        # Mixed case input should work
        password = manager.get_password("Pdb21", "rntmgr2")
        assert password == "case_password"

def test_credential_manager_top_level_token():
    """Test retrieval from top-level JSON in auth_token."""
    manager = CredentialManager()
    token_creds = {
        "username": "RNTMGR2",
        "password": "top_level_password"
    }

    auth_token_var.set(json.dumps(token_creds))
    password = manager.get_password("pdb21", "RNTMGR2")
    assert password == "top_level_password"
