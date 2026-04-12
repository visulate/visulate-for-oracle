"""
Secure credential management for MCP SQL operations.
Provides temporary credential tokens to avoid plaintext password exposure.
"""

import secrets
import time
import base64
import threading
import hashlib
import os
import glob
import json
import fcntl
import stat
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass, asdict
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


@dataclass
class CredentialData:
    """Secure storage for database credentials."""
    username: str
    password: str  # This will be stored ENCRYPTED in high-security environments
    database: str
    session_id: str  # Bound to a specific browser session
    created_at: float
    expires_at: float


# Process-level global storage that survives module reloads
_PROCESS_CREDENTIAL_STORAGE = {}
_PROCESS_STORAGE_LOCK = threading.RLock()

# Ephemeral encryption key generated on startup (process RAM only)
_ENCRYPTION_KEY = Fernet.generate_key()
_FERNET = Fernet(_ENCRYPTION_KEY)


class SecureCredentialManager:
    """
    Manages temporary credential tokens to avoid exposing passwords in MCP calls.

    SECURITY DESIGN:
    - NO PERSISTENT STORAGE - credentials only exist in process memory or /dev/shm
    - IN-MEMORY ENCRYPTION - passwords are encrypted with an ephemeral key
    - SESSION BINDING - tokens are tied to a specific visulate_session_id
    - NO plaintext password storage in logs or responses
    """

    def __init__(self, default_expiry_minutes: int = 30):  # 30 minutes default
        self.default_expiry_minutes = default_expiry_minutes
        # Use process-level storage that survives module reloads
        global _PROCESS_CREDENTIAL_STORAGE, _PROCESS_STORAGE_LOCK
        self._credentials = _PROCESS_CREDENTIAL_STORAGE
        self._lock = _PROCESS_STORAGE_LOCK

    def create_credential_token(self, username: str, password: str, database: str,
                              session_id: str,
                              expiry_minutes: Optional[int] = None) -> str:
        """
        Create a temporary token for database credentials.

        Args:
            username: Database username
            password: Database password (will be encrypted)
            database: Database name
            session_id: The browser session ID this token belongs to
            expiry_minutes: Token expiration time (default: 30 minutes)

        Returns:
            Secure token string that can be used instead of plaintext credentials
        """
        with self._lock:
            # Generate cryptographically secure token
            token = secrets.token_urlsafe(32)

            expiry_time = expiry_minutes or self.default_expiry_minutes
            current_time = time.time()
            expires_at = current_time + (expiry_time * 60)

            # Encrypt password before storage
            encrypted_password = _FERNET.encrypt(password.encode()).decode()

            credential_data = CredentialData(
                username=username,
                password=encrypted_password,
                database=database,
                session_id=session_id,
                created_at=current_time,
                expires_at=expires_at
            )

            self._credentials[token] = credential_data

            # Clean up expired tokens
            self._cleanup_expired_tokens()

            return token

    def get_credentials(self, token: str, session_id: Optional[str] = None) -> Optional[Tuple[str, str, str]]:
        """
        Retrieve credentials using a token.

        Args:
            token: The credential token
            session_id: The browser session ID attempting to use the token

        Returns:
            Tuple of (username, password, database) or None if token invalid/expired/mismatched
        """
        with self._lock:
            credential_data = self._credentials.get(token)

            if not credential_data:
                return None

            # Check if token has expired
            if time.time() > credential_data.expires_at:
                del self._credentials[token]
                return None

            # Verify session binding
            if session_id and credential_data.session_id != session_id:
                logger.warning(f"Session mismatch for token. Token bound to {credential_data.session_id[:8]}, caller is {session_id[:8]}")
                return None

            # Decrypt password for return
            try:
                decrypted_password = _FERNET.decrypt(credential_data.password.encode()).decode()
            except Exception as e:
                logger.error(f"Failed to decrypt password for token (likely process restart): {e}")
                del self._credentials[token]
                return None

            return (credential_data.username, decrypted_password, credential_data.database)

    def revoke_token(self, token: str) -> bool:
        """Immediately revoke a credential token."""
        with self._lock:
            if token in self._credentials:
                del self._credentials[token]
                return True
            return False

    def revoke_session_tokens(self, session_id: str) -> int:
        """Revoke all tokens associated with a session ID."""
        if not session_id:
            return 0
        with self._lock:
            tokens_to_revoke = [
                token for token, cred in self._credentials.items()
                if cred.session_id == session_id
            ]
            for token in tokens_to_revoke:
                del self._credentials[token]
            return len(tokens_to_revoke)

    def revoke_database_tokens(self, session_id: str, database: str) -> int:
        """Revoke all tokens for a specific session and database."""
        if not session_id or not database:
            return 0
        with self._lock:
            tokens_to_revoke = [
                token for token, cred in self._credentials.items()
                if cred.session_id == session_id and cred.database == database
            ]
            for token in tokens_to_revoke:
                del self._credentials[token]
            return len(tokens_to_revoke)

    def _cleanup_expired_tokens(self) -> int:
        """
        Remove expired tokens from storage.

        Returns:
            Number of tokens removed
        """
        current_time = time.time()
        expired_tokens = [
            token for token, cred in self._credentials.items()
            if current_time > cred.expires_at
        ]

        for token in expired_tokens:
            del self._credentials[token]

        return len(expired_tokens)

    def get_active_token_count(self) -> int:
        """Get the number of active (non-expired) tokens."""
        with self._lock:
            self._cleanup_expired_tokens()
            return len(self._credentials)

    def get_instance_info(self) -> dict:
        """Get debugging information about this credential manager instance."""
        with self._lock:
            self._cleanup_expired_tokens()
            return {
                "instance_id": id(self),
                "active_tokens": len(self._credentials),
                "default_expiry_minutes": self.default_expiry_minutes,
                "storage_type": "process_memory_only",
                "storage_security": "no_disk_writes_secure",
                "process_storage_id": id(_PROCESS_CREDENTIAL_STORAGE),
                "token_list": [
                    {
                        "token_prefix": token[:12] + "...",
                        "username": cred.username,
                        "database": cred.database,
                        "session_id_prefix": cred.session_id[:8] + "...",
                        "expires_in_minutes": (cred.expires_at - time.time()) / 60
                    }
                    for token, cred in self._credentials.items()
                ]
            }

    def create_credential_token_from_encoded(self, encoded_credentials: str,
                                           session_id: str,
                                           expiry_minutes: Optional[int] = None) -> str:
        """
        Create a token from base64-encoded credentials (X-DB-Credentials format).

        Args:
            encoded_credentials: Base64 encoded "username/password@database" string
            session_id: The browser session ID
            expiry_minutes: Token expiration time

        Returns:
            Secure token string
        """
        try:
            # Decode the base64 credentials
            decoded_bytes = base64.b64decode(encoded_credentials)
            decoded_str = decoded_bytes.decode('utf-8')

            # Parse format: username/password@database
            user_password, database = decoded_str.split('@')
            username, password = user_password.split('/')

            return self.create_credential_token(username, password, database, session_id, expiry_minutes)

        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid credential format: {e}")


class SharedCredentialManager:
    """
    Shared credential manager using /dev/shm for multi-worker support.
    
    SECURITY DESIGN:
    - Uses RAM-based filesystem (/dev/shm) - no persistent disk storage
    - IN-MEMORY ENCRYPTION - passwords are encrypted with an ephemeral key
    - SESSION BINDING - tokens are tied to a specific visulate_session_id
    - File-based locking for thread and process safety
    - Restrictive file permissions (600) - owner read/write only
    - Automatic cleanup of expired tokens
    - JSON encoding with secure token generation
    - Files automatically deleted when container stops
    """
    
    def __init__(self, default_expiry_minutes: int = 30):
        self.default_expiry_minutes = default_expiry_minutes
        self.storage_dir = "/dev/shm/mcp_credentials"
        self._ensure_storage_dir()
    
    def _ensure_storage_dir(self):
        """Create storage directory with secure permissions."""
        try:
            os.makedirs(self.storage_dir, mode=0o700, exist_ok=True)
            # Ensure directory has correct permissions
            os.chmod(self.storage_dir, 0o700)
        except Exception as e:
            # Fallback to process memory if /dev/shm not available
            print(f"Warning: Could not create /dev/shm storage, falling back to memory: {e}")
            self.storage_dir = None
    
    def _get_token_file_path(self, token: str) -> str:
        """Get the file path for a token."""
        if not self.storage_dir:
            raise RuntimeError("Shared storage not available")
        # Use token hash as filename to avoid filesystem issues
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
        return os.path.join(self.storage_dir, f"token_{token_hash}.json")
    
    def _write_token_file(self, file_path: str, credential_data: CredentialData):
        """Write credential data to file with exclusive locking."""
        temp_file = file_path + ".tmp"
        try:
            with open(temp_file, 'w') as f:
                # Get exclusive lock
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                
                # Convert to dict for JSON serialization
                data = asdict(credential_data)
                json.dump(data, f)
                f.flush()
                os.fsync(f.fileno())
            
            # Set restrictive permissions (600 - owner read/write only)
            os.chmod(temp_file, 0o600)
            
            # Atomically move to final location
            os.rename(temp_file, file_path)
            
        except Exception as e:
            # Clean up temp file on error
            try:
                os.unlink(temp_file)
            except:
                pass
            raise e
    
    def _read_token_file(self, file_path: str) -> Optional[CredentialData]:
        """Read credential data from file with shared locking."""
        try:
            with open(file_path, 'r') as f:
                # Get shared lock for reading
                fcntl.flock(f.fileno(), fcntl.LOCK_SH)
                data = json.load(f)
                return CredentialData(**data)
        except (FileNotFoundError, json.JSONDecodeError, TypeError):
            return None
    
    def create_credential_token(self, username: str, password: str, database: str,
                              session_id: str,
                              expiry_minutes: Optional[int] = None) -> str:
        """
        Create a temporary token for database credentials.
        
        Args:
            username: Database username
            password: Database password (encrypted in /dev/shm)
            database: Database name
            session_id: The browser session ID
            expiry_minutes: Token expiration time (default: 30 minutes)
        
        Returns:
            Secure token string that can be used instead of plaintext credentials
        """
        if not self.storage_dir:
            raise RuntimeError("Shared storage not available")
        
        # Generate cryptographically secure token
        token = secrets.token_urlsafe(32)
        
        expiry_time = expiry_minutes or self.default_expiry_minutes
        current_time = time.time()
        expires_at = current_time + (expiry_time * 60)
        
        # Encrypt password before storage
        encrypted_password = _FERNET.encrypt(password.encode()).decode()

        credential_data = CredentialData(
            username=username,
            password=encrypted_password,
            database=database,
            session_id=session_id,
            created_at=current_time,
            expires_at=expires_at
        )
        
        file_path = self._get_token_file_path(token)
        self._write_token_file(file_path, credential_data)
        
        # Clean up expired tokens periodically
        self._cleanup_expired_tokens()
        
        return token
    
    def get_credentials(self, token: str, session_id: Optional[str] = None) -> Optional[Tuple[str, str, str]]:
        """
        Retrieve credentials using a token.
        
        Args:
            token: The credential token
            session_id: The browser session ID
        
        Returns:
            Tuple of (username, password, database) or None if token invalid/expired/mismatched
        """
        if not self.storage_dir:
            return None
        
        file_path = self._get_token_file_path(token)
        credential_data = self._read_token_file(file_path)
        
        if not credential_data:
            return None
        
        # Check if token has expired
        if time.time() > credential_data.expires_at:
            self._delete_token_file(file_path)
            return None
        
        # Verify session binding
        if session_id and credential_data.session_id != session_id:
            logger.warning(f"Session mismatch for shared token. Token bound to {credential_data.session_id[:8]}, caller is {session_id[:8]}")
            return None

        # Decrypt password
        try:
            decrypted_password = _FERNET.decrypt(credential_data.password.encode()).decode()
        except Exception as e:
            logger.error(f"Failed to decrypt shared password for token (likely process restart): {e}")
            self._delete_token_file(file_path)
            return None
        
        return (credential_data.username, decrypted_password, credential_data.database)
    
    def revoke_token(self, token: str) -> bool:
        """Immediately revoke a credential token."""
        if not self.storage_dir:
            return False
        
        file_path = self._get_token_file_path(token)
        return self._delete_token_file(file_path)

    def revoke_session_tokens(self, session_id: str) -> int:
        """Revoke all tokens associated with a session ID."""
        if not self.storage_dir or not session_id:
            return 0
        
        revoked_count = 0
        try:
            pattern = os.path.join(self.storage_dir, "token_*.json")
            for file_path in glob.glob(pattern):
                credential_data = self._read_token_file(file_path)
                if credential_data and credential_data.session_id == session_id:
                    if self._delete_token_file(file_path):
                        revoked_count += 1
        except Exception as e:
            logger.error(f"Error revoking session tokens in shared storage: {e}")
            
        return revoked_count

    def revoke_database_tokens(self, session_id: str, database: str) -> int:
        """Revoke all tokens for a specific session and database."""
        if not self.storage_dir or not session_id or not database:
            return 0
            
        revoked_count = 0
        try:
            pattern = os.path.join(self.storage_dir, "token_*.json")
            for file_path in glob.glob(pattern):
                credential_data = self._read_token_file(file_path)
                if credential_data and credential_data.session_id == session_id and credential_data.database == database:
                    if self._delete_token_file(file_path):
                        revoked_count += 1
        except Exception as e:
            logger.error(f"Error revoking database tokens in shared storage: {e}")
            
        return revoked_count
    
    def _delete_token_file(self, file_path: str) -> bool:
        """Delete a token file."""
        try:
            os.unlink(file_path)
            return True
        except FileNotFoundError:
            return False
        except Exception:
            return False
    
    def _cleanup_expired_tokens(self):
        """Remove expired token files."""
        if not self.storage_dir:
            return
        
        try:
            current_time = time.time()
            pattern = os.path.join(self.storage_dir, "token_*.json")
            
            for file_path in glob.glob(pattern):
                try:
                    credential_data = self._read_token_file(file_path)
                    if credential_data and current_time > credential_data.expires_at:
                        self._delete_token_file(file_path)
                except Exception:
                    # If we can't read the file, it might be corrupted - delete it
                    self._delete_token_file(file_path)
        except Exception:
            pass  # Cleanup is best-effort
    
    def get_active_token_count(self) -> int:
        """Get count of active (non-expired) tokens."""
        if not self.storage_dir:
            return 0
        
        try:
            current_time = time.time()
            pattern = os.path.join(self.storage_dir, "token_*.json")
            active_count = 0
            
            for file_path in glob.glob(pattern):
                try:
                    credential_data = self._read_token_file(file_path)
                    if credential_data and current_time <= credential_data.expires_at:
                        active_count += 1
                except Exception:
                    pass
            
            return active_count
        except Exception:
            return 0
    
    def get_instance_info(self) -> dict:
        """Get debugging information about this shared credential manager instance."""
        try:
            self._cleanup_expired_tokens()
            active_count = self.get_active_token_count()
            
            # Get token list for debugging
            token_list = []
            if self.storage_dir:
                current_time = time.time()
                pattern = os.path.join(self.storage_dir, "token_*.json")
                
                for file_path in glob.glob(pattern):
                    try:
                        credential_data = self._read_token_file(file_path)
                        if credential_data and current_time <= credential_data.expires_at:
                            # Extract token hash from filename for display
                            filename = os.path.basename(file_path)
                            token_hash = filename.replace('token_', '').replace('.json', '')
                            
                            token_list.append({
                                "token_prefix": token_hash[:12] + "...",
                                "username": credential_data.username,
                                "database": credential_data.database,
                                "session_id_prefix": credential_data.session_id[:8] + "...",
                                "expires_in_minutes": (credential_data.expires_at - current_time) / 60
                            })
                    except Exception:
                        pass
            
            return {
                "instance_id": id(self),
                "active_tokens": active_count,
                "default_expiry_minutes": self.default_expiry_minutes,
                "storage_type": "shared_filesystem_dev_shm",
                "storage_security": "ram_based_no_disk_persistence",
                "storage_dir": self.storage_dir,
                "token_list": token_list
            }
            
        except Exception as e:
            return {
                "instance_id": id(self),
                "active_tokens": 0,
                "error": str(e),
                "storage_type": "shared_filesystem_dev_shm",
                "storage_security": "ram_based_no_disk_persistence",
                "storage_dir": self.storage_dir
            }


# Global credential manager instance with shared storage
credential_manager = SharedCredentialManager()