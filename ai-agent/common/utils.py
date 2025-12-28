import requests
import json
from typing import Dict, Any, Optional

def mask_sensitive_data(d, sensitive_keys=['password', 'credential_token', 'token']):
    """Mask sensitive values in a dictionary or string representation of a dictionary."""
    if isinstance(d, str):
        try:
            # Try to parse if it's a JSON string
            data = json.loads(d)
            if isinstance(data, dict):
                masked = {k: ('********' if k.lower() in sensitive_keys else v) for k, v in data.items()}
                return json.dumps(masked)
        except:
            pass
        return d

    if not isinstance(d, dict):
        return d
    return {k: ('********' if k.lower() in sensitive_keys else v) for k, v in d.items()}

def parse_token_from_response(result: Dict[str, Any]) -> Optional[str]:
    """
    Extracts a credential token from the MCP tool response.
    Args:
        result (Dict[str, Any]): The response dictionary from the MCP tool. It may contain
            - a "credential_token" key with the token as a string, or
            - a "content" key with a list of items, where each item is a dict that may contain
              a "type" key (expected to be "text") and a "text" key containing the token in a specific format.
    Returns:
        Optional[str]: The extracted credential token as a string if found, otherwise None.
            Returns None if the token cannot be found in the expected locations or formats.
    """
    token = None
    if "credential_token" in result:
        token = result["credential_token"]
    elif "content" in result and isinstance(result["content"], list):
        for content_item in result["content"]:
            if content_item.get("type") == "text":
                text = content_item.get("text", "")
                if "Use this token for execute_sql calls:" in text:
                    token = text.split("Use this token for execute_sql calls:")[-1].strip()
                    break
                elif "Token:" in text:
                    token = text.split("Token:")[-1].strip()
                    break
    return token

def create_token_request(query_engine_url: str, database: str, username: str, password: str, expiry_minutes: int = 30) -> Dict[str, Any]:
    """
    Helper to call the create_credential_token tool.
    Args:
        query_engine_url (str): The base URL of the query engine.
        database (str): The name of the database.
        username (str): The username for authentication.
        password (str): The password for authentication.
        expiry_minutes (int, optional): Token expiry time in minutes. Defaults to 30.
    Returns:
        Dict[str, Any]: On success, returns the JSON response from the tool.
            On error, returns a dictionary with an "error" key containing the error message, e.g. {"error": "<error_message>"}.
    """
    url = f"{query_engine_url}/call_tool"
    payload = {
        "name": "create_credential_token",
        "arguments": {
            "database": database,
            "username": username,
            "password": password,
            "expiry_minutes": expiry_minutes
        }
    }
    try:
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        return {
            "error": f"Request to {url} failed: {str(e)}",
            "exception_type": type(e).__name__
        }
