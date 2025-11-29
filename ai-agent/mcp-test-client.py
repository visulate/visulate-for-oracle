#!/usr/bin/env python3
"""
MCP Test Client for Visulate for Oracle

This script demonstrates how to interact with the Visulate MCP endpoints:
- API Server (/mcp): Database introspection and context retrieval
- Query Engine (/mcp-sql): Secure SQL execution with credential tokens
Edit the configuration section in main() to set your database, username, and password before running.

Usage:
    uv run mcp-test-client.py

Requirements:
    - .env file with GOOGLE_API_KEY and VISULATE_BASE
    - Visulate for Oracle running with MCP endpoints enabled
"""

import os
import sys
import json
import re
import requests
from typing import Dict, Any, Optional
from dataclasses import dataclass
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class MCPConfig:
    """Configuration for MCP client"""
    google_api_key: str
    visulate_base: str
    api_server_url: str
    query_engine_url: str

def get_config() -> MCPConfig:
    """Load configuration from environment variables"""
    google_api_key = os.getenv("GOOGLE_API_KEY")
    visulate_base = os.getenv("VISULATE_BASE", "http://localhost")

    if not google_api_key:
        print("Error: GOOGLE_API_KEY not found in environment")
        print("Get an API key from: https://aistudio.google.com/apikey")
        sys.exit(1)

    # Remove trailing slash if present
    visulate_base = visulate_base.rstrip('/')

    # Handle both reverse proxy and direct access scenarios
    if "localhost" in visulate_base and ":" not in visulate_base:
        # Local development without reverse proxy
        api_server_url = f"{visulate_base}:3000/mcp"
        query_engine_url = f"{visulate_base}:5000/mcp-sql"
    elif "localhost" in visulate_base:
        # Local development with specific port
        api_server_url = f"{visulate_base}/mcp"
        query_engine_url = f"{visulate_base.replace(':3000', ':5000')}/mcp-sql"
    else:
        # Production with reverse proxy - both endpoints on same base URL
        api_server_url = f"{visulate_base}/mcp"
        query_engine_url = f"{visulate_base}/mcp-sql"

    return MCPConfig(
        google_api_key=google_api_key,
        visulate_base=visulate_base,
        api_server_url=api_server_url,
        query_engine_url=query_engine_url
    )

class MCPClient:
    """Client for interacting with Visulate MCP endpoints"""

    def __init__(self, config: MCPConfig):
        self.config = config
        self.session = requests.Session()
        self.credential_token: Optional[str] = None

    def call_api_server_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the API server MCP endpoint"""
        url = f"{self.config.api_server_url}"
        payload = {
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }

        print(f"🔍 Calling API server tool: {tool_name}")
        print(f"   Arguments: {json.dumps(arguments, indent=2)}")

        try:
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            print(f"✅ Success: {tool_name}")
            return result
        except Exception as e:
            print(f"❌ Error calling {tool_name}: {e}")
            return {"error": str(e)}

    def call_query_engine_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a tool on the Query Engine MCP endpoint"""
        url = f"{self.config.query_engine_url}/call_tool"
        payload = {
            "name": tool_name,
            "arguments": arguments
        }

        print(f"🔐 Calling Query Engine tool: {tool_name}")
        if tool_name != "create_credential_token":
            # Don't log passwords
            print(f"   Arguments: {json.dumps(arguments, indent=2)}")
        else:
            safe_args = {k: v if k != "password" else "***" for k, v in arguments.items()}
            print(f"   Arguments: {json.dumps(safe_args, indent=2)}")

        try:
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            print(f"✅ Success: {tool_name}")
            return result
        except Exception as e:
            print(f"❌ Error calling {tool_name}: {e}")
            return {"error": str(e)}

    def create_credential_token(self, database: str, username: str, password: str, expiry_minutes: int = 30) -> bool:
        """Create a secure credential token for database access"""
        result = self.call_query_engine_tool("create_credential_token", {
            "database": database,
            "username": username,
            "password": password,
            "expiry_minutes": expiry_minutes
        })

        # Handle different response formats
        token = None

        # Direct format: {"credential_token": "abc123..."}
        if "credential_token" in result:
            token = result["credential_token"]

        # MCP format: {"content": [{"text": "...token: abc123...", "type": "text"}]}
        elif "content" in result and isinstance(result["content"], list):
            for content_item in result["content"]:
                if content_item.get("type") == "text":
                    text = content_item.get("text", "")
                    # Extract token from text like "Use this token for execute_sql calls: abc123..."
                    if "Use this token for execute_sql calls:" in text:
                        token = text.split("Use this token for execute_sql calls:")[-1].strip()
                        break
                    # Also handle format like "Token: abc123..."
                    elif "Token:" in text:
                        token = text.split("Token:")[-1].strip()
                        break

        if token:
            self.credential_token = token
            print(f"🔑 Credential token created: {self.credential_token[:12]}...")
            return True
        else:
            print(f"❌ Failed to create credential token: {result}")
            return False

    def execute_sql(self, database: str, sql: str, binds: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute SQL using the secure credential token"""
        if not self.credential_token:
            return {"error": "No credential token available. Call create_credential_token first."}

        arguments = {
            "database": database,
            "credential_token": self.credential_token,
            "sql": sql
        }

        if binds:
            arguments["binds"] = binds

        result = self.call_query_engine_tool("execute_sql", arguments)

        # Parse MCP response format
        return self._parse_sql_response(result)

    def _parse_sql_response(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Parse SQL execution response from MCP format"""
        # Handle MCP format: {"content": [{"text": "...", "type": "text"}]}
        if "content" in result and isinstance(result["content"], list):
            for content_item in result["content"]:
                if content_item.get("type") == "text":
                    text = content_item.get("text", "")

                    # Check for success
                    if "Query executed successfully" in text:
                        # Extract data from text like "Results:\n[\n  {...}\n]"
                        try:

                            # Find the JSON results section
                            results_match = re.search(r'Results:\s*(\[.*?\])', text, re.DOTALL)
                            if results_match:
                                json_str = results_match.group(1)
                                data = json.loads(json_str)

                                # Extract row count
                                rows_match = re.search(r'Rows returned:\s*(\d+)', text)
                                row_count = int(rows_match.group(1)) if rows_match else len(data)

                                return {
                                    "success": True,
                                    "data": data,
                                    "rows_returned": row_count,
                                    "raw_text": text
                                }
                        except (json.JSONDecodeError, AttributeError) as e:
                            return {
                                "success": True,
                                "data": [],
                                "error": f"Could not parse results: {e}",
                                "raw_text": text
                            }

                    # Check for failure
                    elif "Query failed" in text:
                        # Extract error message
                        error_match = re.search(r'Error:\s*(.+)', text)
                        error_msg = error_match.group(1) if error_match else "Unknown error"

                        return {
                            "success": False,
                            "error": error_msg,
                            "raw_text": text
                        }

        # Fallback to original format if not MCP
        return result

    def search_objects(self, database: str, search_terms: list, object_types: list) -> Dict[str, Any]:
        """Search for database objects using the API server"""
        url = f"{self.config.api_server_url}/search-objects/{database}"
        payload = {
            "search_terms": search_terms,
            "object_types": object_types
        }

        print(f"🔍 Searching objects in {database}")
        print(f"   Search terms: {search_terms}")
        print(f"   Object types: {object_types}")

        try:
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            print(f"✅ Found {len(result)} objects")
            return result
        except Exception as e:
            print(f"❌ Error searching objects: {e}")
            return {"error": str(e)}

    def get_context(self, database: str, owner: str, name: str, type_: str) -> Dict[str, Any]:
        """Get full context for a database object"""
        url = f"{self.config.api_server_url}/context/{database}"
        payload = {
            "owner": owner,
            "name": name,
            "type": type_
        }

        print(f"📋 Getting context for {owner}.{name} ({type_}) in {database}")

        try:
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()
            print(f"✅ Context retrieved successfully")
            return result
        except Exception as e:
            print(f"❌ Error getting context: {e}")
            return {"error": str(e)}

    def list_databases(self) -> Dict[str, Any]:
        """List available databases from query engine"""
        return self.call_query_engine_tool("list_databases", {})

    def revoke_token(self) -> bool:
        """Revoke the current credential token"""
        if not self.credential_token:
            print("❌ No token to revoke")
            return False

        result = self.call_query_engine_tool("revoke_credential_token", {
            "credential_token": self.credential_token
        })

        # Handle direct format
        if result.get("revoked"):
            print("🗑️ Token revoked successfully")
            self.credential_token = None
            return True

        # Handle MCP format
        if "content" in result and isinstance(result["content"], list):
            for content_item in result["content"]:
                if content_item.get("type") == "text":
                    text = content_item.get("text", "")
                    if "revoked successfully" in text.lower():
                        print("🗑️ Token revoked successfully")
                        self.credential_token = None
                        return True

        print(f"❌ Failed to revoke token: {result}")
        return False

def demo_api_server(client: MCPClient, database: str):
    """Demonstrate API server MCP functionality"""
    print("\n" + "="*60)
    print("🏛️  DEMO: API SERVER MCP FUNCTIONALITY")
    print("="*60)

    # Search for tables related to accounts
    print("\n1. Searching for tables related to 'accounts'...")
    search_result = client.search_objects(
        database=database,
        search_terms=["account", "receivable"],
        object_types=["TABLE", "VIEW"]
    )

    if isinstance(search_result, dict) and search_result.get("error"):
        print(f"❌ Search failed: {search_result['error']}")
        return

    # Get context for the first result
    if search_result and isinstance(search_result, list) and len(search_result) > 0:
        first_object = search_result[0]
        print(f"\n2. Getting context for top result: {first_object}")

        # Handle different response formats from the API
        owner = first_object.get("owner") or first_object.get("OWNER", "UNKNOWN")
        name = first_object.get("name") or first_object.get("NAME", "UNKNOWN")
        type_ = first_object.get("type") or first_object.get("TYPE", "TABLE")

        context_result = client.get_context(
            database=database,
            owner=owner,
            name=name,
            type_=type_
        )

        if context_result.get("error"):
            print(f"❌ Context retrieval failed: {context_result['error']}")
        else:
            print("📋 Context retrieved - contains object details and related objects")
    elif not search_result or len(search_result) == 0:
        print("❌ No objects found in search results")
    else:
        print(f"❌ Unexpected search result format: {type(search_result)}")

def demo_query_engine(client: MCPClient, database: str, username: str, password: str):
    """Demonstrate Query Engine MCP functionality"""
    print("\n" + "="*60)
    print("🔐 DEMO: QUERY ENGINE MCP FUNCTIONALITY")
    print("="*60)

    # List available databases
    print("\n1. Listing available databases...")
    db_result = client.list_databases()
    if db_result.get("error"):
        print(f"❌ Failed to list databases: {db_result['error']}")
        return

    # Create credential token
    print(f"\n2. Creating credential token for {database}...")
    if not client.create_credential_token(database, username, password):
        print("❌ Cannot continue without credential token")
        return

    # Execute simple SQL queries
    queries = [
        {
            "name": "Count user tables",
            "sql": "SELECT COUNT(*) as table_count FROM user_tables",
        },
        {
            "name": "Show first 5 tables",
            "sql": "SELECT table_name FROM user_tables WHERE rownum <= 5 ORDER BY table_name",
        },
        {
            "name": "Database version",
            "sql": "SELECT banner FROM v$version WHERE rownum = 1",
        }
    ]

    for i, query in enumerate(queries, 3):
        print(f"\n{i}. Executing: {query['name']}")
        result = client.execute_sql(database, query["sql"])

        if result.get("error"):
            print(f"❌ SQL execution failed: {result['error']}")
        elif result.get("success"):
            data = result.get("data", [])
            print(f"✅ Query successful - {len(data)} rows returned")
            if data and len(data) <= 3:  # Show results if small
                print(f"   Result: {data}")
        else:
            print(f"❌ Unexpected response: {result}")

    # Clean up
    print(f"\n{len(queries)+3}. Revoking credential token...")
    client.revoke_token()

def main():
    """Main function to run MCP client demos"""
    print("🚀 Visulate MCP Test Client")
    print("=" * 60)

    config = get_config()
    print(f"📡 API Server: {config.api_server_url}")
    print(f"🔐 Query Engine: {config.query_engine_url}")
    print("💡 URLs configured for reverse proxy deployment (no port numbers needed)")

    client = MCPClient(config)

    # Configuration - Edit these for your environment
    DATABASE = "pdb21"  # Edit this to match your registered database
    USERNAME = "RNTMGR2"  # Edit this to match your database username
    PASSWORD = "DevPasswd"  # Edit this to match your database password

    print(f"\n🎯 Target Database: {DATABASE}")
    print("⚠️  Edit the DATABASE, USERNAME, PASSWORD variables in this script for your environment")

    # Run demos
    try:
        demo_api_server(client, DATABASE)
        demo_query_engine(client, DATABASE, USERNAME, PASSWORD)

        print("\n" + "="*60)
        print("✅ MCP CLIENT DEMO COMPLETED SUCCESSFULLY")
        print("="*60)
        print("\n💡 Next Steps:")
        print("   - Modify the prompts and queries for your specific use case")
        print("   - Integrate with your AI workflows using these MCP patterns")
        print("   - Check the OpenAPI spec for additional endpoint documentation")

    except KeyboardInterrupt:
        print("\n⚠️  Demo interrupted by user")
    except Exception as e:
        print(f"\n❌ Demo failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()