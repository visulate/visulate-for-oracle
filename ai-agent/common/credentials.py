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
        Retrieves a password, trying auth_token_var (provided by UI) first,
        then GCP Secret Manager, then .env.
        """
        from common.context import auth_token_var
        import json

        db_name = db_name.lower()
        schema_name = schema_name.upper()

        # 1. Try auth_token_var (UI credentials)
        auth_token = auth_token_var.get()
        if auth_token:
            try:
                # The auth_token is expected to be a JSON string of credentials
                creds = json.loads(auth_token)
                # Check for database-specific credentials
                if db_name in creds and isinstance(creds[db_name], dict):
                    db_creds = creds[db_name]
                    if db_creds.get("username", "").upper() == schema_name:
                        password = db_creds.get("password")
                        if password:
                            logger.info(f"Fetched password for {db_name}.{schema_name} from auth_token.")
                            return password

                # Check top-level if match
                if creds.get("username", "").upper() == schema_name:
                    password = creds.get("password")
                    if password:
                         logger.info(f"Fetched password for {schema_name} from top-level auth_token.")
                         return password

            except Exception as e:
                logger.warning(f"Failed to parse auth_token JSON: {e}")

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
