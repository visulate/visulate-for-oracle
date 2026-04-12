import pytest
import time
import os
import shutil
import json
from sql2csv.secure_credentials import SecureCredentialManager, SharedCredentialManager

def test_secure_credential_manager_basic():
    mgr = SecureCredentialManager()
    token = mgr.create_credential_token("user", "pass", "db", "session1")
    assert token is not None
    
    creds = mgr.get_credentials(token, "session1")
    assert creds == ("user", "pass", "db")

def test_secure_credential_manager_session_isolation():
    mgr = SecureCredentialManager()
    token = mgr.create_credential_token("user", "pass", "db", "session1")
    
    # Try with wrong session
    creds = mgr.get_credentials(token, "session2")
    assert creds is None
    
    # Try with correct session
    creds = mgr.get_credentials(token, "session1")
    assert creds == ("user", "pass", "db")

def test_secure_credential_manager_expiration():
    mgr = SecureCredentialManager()
    # Expire in 0 minutes (immediate)
    token = mgr.create_credential_token("user", "pass", "db", "session1", expiry_minutes=-1)
    
    creds = mgr.get_credentials(token, "session1")
    assert creds is None

def test_shared_credential_manager_encryption_and_isolation():
    # Setup temp shm dir for testing
    test_shm = "/tmp/shm_test"
    if os.path.exists(test_shm):
        shutil.rmtree(test_shm)
    os.makedirs(test_shm, mode=0o700)
    
    # Patch storage dir for test
    mgr = SharedCredentialManager()
    mgr.storage_dir = test_shm
    
    token = mgr.create_credential_token("user", "pass", "db", "sessionA")
    assert token is not None
    
    # Check that file exists but is NOT plaintext
    token_hash = mgr._get_token_file_path(token)
    assert os.path.exists(token_hash)
    
    with open(token_hash, 'r') as f:
        data = json.load(f)
        assert data["password"] != "pass"
        assert len(data["password"]) > 20 # Encrypted string is usually long
        assert data["username"] == "user"
    
    # Verify retrieval
    creds = mgr.get_credentials(token, "sessionA")
    assert creds == ("user", "pass", "db")
    
    # Verify isolation
    creds_wrong = mgr.get_credentials(token, "sessionB")
    assert creds_wrong is None
    
    shutil.rmtree(test_shm)

def test_encryption_key_persistence():
    # Verify that decryption fails if the global key were different (simulated by new manager)
    # Actually _FERNET is a module global, so it's shared. 
    # But we can verify that credentials retrieved from Shared manager are decrypted correctly.
    mgr = SharedCredentialManager()
    test_shm = "/tmp/shm_test_2"
    os.makedirs(test_shm, mode=0o700, exist_ok=True)
    mgr.storage_dir = test_shm
    
    token = mgr.create_credential_token("user", "super_secret", "db", "sess1")
    
    # Read raw to ensure secret is not there
    path = mgr._get_token_file_path(token)
    with open(path, 'r') as f:
        raw = f.read()
        assert "super_secret" not in raw
    
    # Retrieve and verify decryption
    creds = mgr.get_credentials(token, "sess1")
    assert creds[1] == "super_secret"

    shutil.rmtree(test_shm)
