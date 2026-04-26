import os
import logging
from typing import Optional
from google.api_core import exceptions
from google.cloud import secretmanager
from common.context import auth_token_var, db_credentials_var, progress_callback_var
import json

logger = logging.getLogger(__name__)

class CredentialManager:
    """Manages retrieval of database credentials from GCP Secret Manager or .env."""

    def __init__(self):
        self.gcp_project = os.getenv("GCP_PROJECT_ID")
        self.secret_client = None
        if self.gcp_project:
            try:
                self.secret_client = secretmanager.SecretManagerServiceClient()
                logger.info("GCP Secret Manager client initialized.")
            except Exception as e:
                logger.warning(
                    f"Failed to initialize GCP Secret Manager client: {e}"
                )
                self.gcp_project = None

    def get_password(self, db_name: str, schema_name: str, username: Optional[str] = None) -> tuple[str | None, str | None, str | None]:
        """
        Retrieves a password, trying db_credentials_var first, then auth_token_var,
        then GCP Secret Manager, then .env.
        Returns:
            tuple: (password, source, username)
        """
        db_name = db_name.lower()
        schema_name = schema_name.upper()
        callback = progress_callback_var.get()

        # 1. Try db_credentials_var (Explicit DB credentials from UI)
        db_creds = db_credentials_var.get()
        if db_creds:
            try:
                creds = json.loads(db_creds) if isinstance(db_creds, str) else db_creds
                
                # Check for database-specific credentials
                if db_name in creds and isinstance(creds[db_name], dict):
                    match_creds = creds[db_name]
                    found_user = match_creds.get("username")
                    
                    # Match if: 
                    # 1. Explicit username matches
                    # 2. No username provided, but schema matches (Oracle style)
                    # 3. No username provided, and it's the only cred for this DB (Postgres style)
                    if (username and found_user and found_user.upper() == username.upper()) or \
                       (not username and found_user and found_user.upper() == schema_name) or \
                       (not username and found_user):
                        password = match_creds.get("password")
                        if password:
                            logger.info(f"Fetched password for {db_name} (user: {found_user}) from db_credentials.")
                            return password, 'ui-context', found_user

                # Check top-level if match
                found_user = creds.get("username")
                if found_user:
                    if (username and found_user.upper() == username.upper()) or \
                       (not username and found_user.upper() == schema_name) or \
                       (not username and found_user):
                        password = creds.get("password")
                        if password:
                             logger.info(f"Fetched password for {found_user} from top-level db_credentials.")
                             return password, 'ui-context', found_user
            except Exception as e:
                logger.warning(f"Failed to parse db_credentials: {e}")

        # 2. Try auth_token_var (Fallback for nested/legacy cases)
        auth_token = auth_token_var.get()
        if auth_token:
            try:
                # The auth_token might contain JSON credentials in some cases
                creds = json.loads(auth_token)
                if db_name in creds and isinstance(creds[db_name], dict):
                    match_creds = creds[db_name]
                    if match_creds.get("username", "").upper() == schema_name:
                        password = match_creds.get("password")
                        if password:
                            logger.info(f"Fetched password for {db_name}.{schema_name} from auth_token (UI-Context-Legacy).")
                            if callback:
                                callback(f"▌INFO: Using credentials from UI context (legacy token).")
                            return password, 'ui-context-legacy', match_creds.get("username")

                # Check top-level if match
                if creds.get("username", "").upper() == schema_name:
                    password = creds.get("password")
                    if password:
                         logger.info(f"Fetched password for {schema_name} from top-level auth_token (UI-Context-Legacy).")
                         if callback:
                             callback(f"▌INFO: Using credentials from UI context (legacy token).")
                         return password, 'ui-context-legacy', creds.get("username")
            except:
                pass # auth_token is likely a JWT, skip

        # 3. Try GCP Secret Manager
        if self.secret_client:
            # Try with username if provided, otherwise with schema
            lookup_user = username or schema_name
            secret_name = f"db-password-{db_name}-{lookup_user.lower()}"
            secret_path = self.secret_client.secret_version_path(
                self.gcp_project, secret_name, "latest"
            )
            try:
                response = self.secret_client.access_secret_version(
                    request={"name": secret_path}
                )
                password = response.payload.data.decode("UTF-8")
                logger.info(f"Fetched secret '{secret_name}' from GCP.")
                return password, 'gcp-secret-manager', lookup_user
            except Exception:
                pass

        # 4. Fallback to environment variables
        lookup_user = (username or schema_name).upper()
        env_var_name = f"DB_PASSWORD_{db_name.upper()}_{lookup_user}"
        password = os.getenv(env_var_name)
        if password:
            logger.info(f"Fetched password from env var '{env_var_name}'.")
            return password, 'server-env-var', lookup_user
        
        logger.warning(f"Password not found for {db_name} (user/schema: {schema_name}/{username}) in any source.")
        return None, None, None
