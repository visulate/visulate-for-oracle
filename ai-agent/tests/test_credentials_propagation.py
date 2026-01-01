import json
import pytest
from common.credentials import CredentialManager
from common.context import auth_token_var, db_credentials_var

def test_credential_manager_db_credentials_priority():
    """Test that db_credentials_var has priority over auth_token_var."""
    manager = CredentialManager()

    # 1. Set a legacy token (or something that might fail JSON parse)
    auth_token_var.set("SOME_NON_JSON_JWT_TOKEN")

    # 2. Set explicit DB credentials
    db_creds = {
        "pdb23": {
            "username": "RNTMGR2",
            "password": "correct_password"
        }
    }
    db_credentials_var.set(db_creds)

    password = manager.get_password("pdb23", "RNTMGR2")
    assert password == "correct_password"

def test_credential_manager_handles_missing_db_credentials():
    """Test that it falls back to auth_token_var if db_credentials_var is empty."""
    manager = CredentialManager()
    db_credentials_var.set(None)

    token_creds = {
        "pdb23": {
            "username": "RNTMGR2",
            "password": "token_password"
        }
    }
    auth_token_var.set(json.dumps(token_creds))

    password = manager.get_password("pdb23", "RNTMGR2")
    assert password == "token_password"

def test_credential_manager_handles_top_level_db_credentials():
    """Test that it handles top-level username/password in db_credentials_var."""
    manager = CredentialManager()
    db_creds = {
        "username": "RNTMGR2",
        "password": "top_level_password"
    }
    db_credentials_var.set(db_creds)

    password = manager.get_password("pdb23", "RNTMGR2")
    assert password == "top_level_password"
