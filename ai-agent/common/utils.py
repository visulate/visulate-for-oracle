import requests
from typing import Dict, Any, Optional

def parse_token_from_response(result: Dict[str, Any]) -> Optional[str]:
    """Extract credential token from MCP tool response"""
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
    """Helper to call create_credential_token tool"""
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
    except Exception as e:
        return {"error": str(e)}
