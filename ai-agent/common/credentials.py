import os
import logging
from google.api_core import exceptions
from google.cloud import secretmanager

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

    def get_password(self, db_name: str, schema_name: str) -> str | None:
        """
        Retrieves a password, trying db_credentials_var first, then auth_token_var,
        then GCP Secret Manager, then .env.
        """
        from common.context import auth_token_var, db_credentials_var
        import json

        db_name = db_name.lower()
        schema_name = schema_name.upper()

        # 1. Try db_credentials_var (Explicit DB credentials from UI)
        db_creds = db_credentials_var.get()
        if db_creds:
            try:
                # Could be a JSON string or already a dict
                creds = json.loads(db_creds) if isinstance(db_creds, str) else db_creds

                # Check for database-specific credentials
                if db_name in creds and isinstance(creds[db_name], dict):
                    match_creds = creds[db_name]
                    if match_creds.get("username", "").upper() == schema_name:
                        password = match_creds.get("password")
                        if password:
                            logger.info(f"Fetched password for {db_name}.{schema_name} from db_credentials.")
                            return password

                # Check top-level if match
                if creds.get("username", "").upper() == schema_name:
                    password = creds.get("password")
                    if password:
                         logger.info(f"Fetched password for {schema_name} from top-level db_credentials.")
                         return password
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
                            logger.info(f"Fetched password for {db_name}.{schema_name} from auth_token.")
                            return password

                # Check top-level if match
                if creds.get("username", "").upper() == schema_name:
                    password = creds.get("password")
                    if password:
                         logger.info(f"Fetched password for {schema_name} from top-level auth_token.")
                         return password
            except:
                pass # auth_token is likely a JWT, skip

        # 2. Try GCP Secret Manager

        if self.secret_client:
            secret_name = f"db-password-{db_name}-{schema_name}"
            secret_path = self.secret_client.secret_version_path(
                self.gcp_project, secret_name, "latest"
            )
            try:
                response = self.secret_client.access_secret_version(
                    request={"name": secret_path}
                )
                password = response.payload.data.decode("UTF-8")
                logger.info(f"Fetched secret '{secret_name}' from GCP.")
                return password
            except exceptions.NotFound:
                logger.info(f"Secret '{secret_name}' not found in GCP, checking .env.")
            except Exception as e:
                logger.warning(f"Error fetching secret '{secret_name}' from GCP: {e}")

        # Fallback to environment variables
        env_var_name = f"DB_PASSWORD_{db_name.upper()}_{schema_name.upper()}"
        password = os.getenv(env_var_name)
        if password:
            logger.info(f"Fetched password from env var '{env_var_name}'.")
        else:
            logger.warning(f"Password not found in GCP or for env var '{env_var_name}'.")
        return password
