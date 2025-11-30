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
        Retrieves a password, trying GCP Secret Manager first, then .env.
        """
        db_name = db_name.lower()
        schema_name = schema_name.upper()

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
