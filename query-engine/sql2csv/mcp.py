"""
MCP (Model Context Protocol) blueprint for the Visulate query engine.
Provides MCP-compatible endpoints for SQL execution.
"""

import json
import logging
import time
from flask import Blueprint, request, jsonify, current_app
from werkzeug.exceptions import BadRequest

# Check if MCP library is available
try:
    import mcp
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False

# Import local SQL execution functions
from . import sql2csv
from .secure_credentials import credential_manager

bp = Blueprint('mcp', __name__, url_prefix='/mcp')

logger = logging.getLogger(__name__)


def format_sql_response(database, username, sql_query, result):
    """Format SQL execution result into a readable response text. Sanitized to avoid credential exposure."""
    if result["success"]:
        response_text = f"Query executed successfully on {database}:\n\n"
        response_text += f"SQL: {sql_query}\n\n"
        if result.get("row_count") is not None:
            response_text += f"Rows returned: {result['row_count']}\n\n"
        response_text += f"Results:\n{json.dumps(result['data'], indent=2)}"
    else:
        response_text = f"Query failed on {database}:\n\n"
        response_text += f"SQL: {sql_query}\n\n"
        response_text += f"Error: {result['error']}"

    return response_text


@bp.route('/', methods=['GET', 'POST', 'DELETE'])
@bp.route('', methods=['GET', 'POST', 'DELETE'])
def handle_mcp_request():
    """Root MCP endpoint that handles standard MCP protocol requests."""
    try:
        if request.method == 'GET':
            # Handle MCP server info request
            return jsonify({
                "jsonrpc": "2.0",
                "result": {
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "visulate-query-engine",
                        "version": "1.0.0"
                    }
                }
            })

        elif request.method == 'POST':
            # Handle MCP protocol requests
            data = request.get_json()
            if not data:
                return jsonify({
                    "jsonrpc": "2.0",
                    "error": {"code": -32600, "message": "Invalid Request"}
                }), 400

            method = data.get("method")
            params = data.get("params", {})
            request_id = data.get("id")

            if method == "initialize":
                # Handle MCP initialization
                client_info = params.get("clientInfo", {})
                protocol_version = params.get("protocolVersion", "2024-11-05")

                return jsonify({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "protocolVersion": protocol_version,
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "visulate-query-engine",
                            "version": "1.0.0"
                        }
                    }
                })

            elif method == "notifications/initialized":
                # Handle initialization notification (no response needed for notifications)
                logger.info("MCP client initialization complete")
                return "", 204  # No Content response for notifications

            elif method == "tools/list":
                tools = McpTools.create_tools()
                return jsonify({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {"tools": tools}
                })

            elif method == "tools/call":
                tool_name = params.get("name")
                arguments = params.get("arguments", {})

                # Route to call_tool logic
                if tool_name == "execute_sql":
                    database = arguments.get("database")
                    sql_query = arguments.get("sql")
                    credential_token = arguments.get("credential_token")

                    if not all([database, sql_query, credential_token]):
                        return jsonify({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": "Missing required arguments: database, sql, credential_token"}
                        }), 400

                    result = McpTools.execute_sql_query_with_token(database, sql_query, credential_token)

                    # Get username for logging (without exposing password)
                    username = result.get("username", "unknown")
                    response_text = format_sql_response(database, username, sql_query, result)

                    return jsonify({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "content": [{"type": "text", "text": response_text}]
                        }
                    })

                elif tool_name == "create_credential_token":
                    username = arguments.get("username")
                    password = arguments.get("password")
                    database = arguments.get("database")
                    expiry_minutes = arguments.get("expiry_minutes", 30)  # 30 minutes default

                    if not all([username, password, database]):
                        return jsonify({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": "Missing required arguments: username, password, database"}
                        }), 400

                    token = credential_manager.create_credential_token(username, password, database, expiry_minutes)

                    # Log token creation for debugging (without sensitive data)
                    logger.info(f"Credential token created for {database}, user {username}, expires in {expiry_minutes}min")

                    response_text = f"Credential token created successfully for {database}.\n"
                    response_text += f"Token expires in {expiry_minutes} minutes.\n"
                    response_text += f"Use this token for execute_sql calls: {token}"

                    return jsonify({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "content": [{"type": "text", "text": response_text}]
                        }
                    })

                elif tool_name == "revoke_credential_token":
                    credential_token = arguments.get("credential_token")

                    if not credential_token:
                        return jsonify({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": "Missing required argument: credential_token"}
                        }), 400

                    revoked = credential_manager.revoke_token(credential_token)

                    if revoked:
                        response_text = "Credential token revoked successfully."
                    else:
                        response_text = "Credential token not found or already expired."

                    return jsonify({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "content": [{"type": "text", "text": response_text}]
                        }
                    })

                elif tool_name == "list_databases":
                    databases = current_app.endpoints
                    response_text = "Available databases for SQL execution:\n\n"
                    for name, connection_string in databases.items():
                        response_text += f"- {name}: {connection_string}\n"
                    response_text += "\nNote: Create a credential token first using create_credential_token, then use that token for execute_sql calls."

                    return jsonify({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "result": {
                            "content": [{"type": "text", "text": response_text}]
                        }
                    })

                else:
                    return jsonify({
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}
                    }), 400

            else:
                return jsonify({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": f"Unknown method: {method}"}
                }), 400

        elif request.method == 'DELETE':
            # Handle disconnect
            return jsonify({
                "jsonrpc": "2.0",
                "result": {}
            })

    except Exception as e:
        logger.error(f"Error handling MCP request: {e}")
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32603, "message": "Internal error"}
        }), 500


class McpTools:
    """MCP tool definitions and handlers for SQL operations."""

    @staticmethod
    def get_available_databases():
        """Get list of available databases from app.endpoints."""
        return list(current_app.endpoints.keys())

    @staticmethod
    def create_tools():
        """Create MCP tool definitions for SQL execution."""
        available_dbs = McpTools.get_available_databases()

        tools = [
            {
                "name": "create_credential_token",
                "description": "Create a temporary, secure credential token for database access. This token can then be used for SQL execution without exposing passwords in subsequent calls.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "database": {
                            "type": "string",
                            "description": f"Database name. Available: {', '.join(available_dbs)}",
                            "enum": available_dbs
                        },
                        "username": {
                            "type": "string",
                            "description": "Database username (e.g., schema owner like RNTMGR2)"
                        },
                        "password": {
                            "type": "string",
                            "description": "Database password for the username (will be securely stored temporarily)"
                        },
                        "expiry_minutes": {
                            "type": "integer",
                            "description": "Token expiration time in minutes (default: 30)",
                            "default": 30,
                            "minimum": 1,
                            "maximum": 1440
                        }
                    },
                    "required": ["database", "username", "password"]
                }
            },

            {
                "name": "execute_sql",
                "description": "Execute a SQL query on a specified database using a secure credential token. Create a credential token first using create_credential_token. Used when the AI model needs to query application tables rather than metadata in the data dictionary.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "database": {
                            "type": "string",
                            "description": f"Database name. Available: {', '.join(available_dbs)}",
                            "enum": available_dbs
                        },
                        "sql": {
                            "type": "string",
                            "description": "SQL query to execute (SELECT statements only)"
                        },
                        "credential_token": {
                            "type": "string",
                            "description": "Secure credential token obtained from create_credential_token"
                        }
                    },
                    "required": ["database", "sql", "credential_token"]
                }
            },

            {
                "name": "revoke_credential_token",
                "description": "Immediately revoke a credential token for security purposes",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "credential_token": {
                            "type": "string",
                            "description": "The credential token to revoke"
                        }
                    },
                    "required": ["credential_token"]
                }
            },

            {
                "name": "list_databases",
                "description": "List all available databases configured in the system",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        ]

        return tools

    @staticmethod
    def execute_sql_query_with_token(database, sql_query, credential_token):
        """Execute SQL using secure credential token."""
        try:
            # Retrieve credentials using the token
            credentials = credential_manager.get_credentials(credential_token)
            if not credentials:
                # Debug information about credential manager state
                manager_info = credential_manager.get_instance_info()
                logger.warning(f"Token validation failed for {database}. Manager info: active_tokens={manager_info['active_tokens']}, instance_id={manager_info['instance_id']}")
                return {
                    "success": False,
                    "error": "Invalid or expired credential token",
                    "database": database,
                    "query": sql_query,
                    "username": "unknown"
                }

            username, password, token_database = credentials

            # Verify database matches
            if token_database != database:
                return {
                    "success": False,
                    "error": f"Credential token is for database '{token_database}', not '{database}'",
                    "database": database,
                    "query": sql_query,
                    "username": username
                }

            # Use the internal SQL execution function
            result = sql2csv.execute_sql_internal(database, sql_query, username, password)

            # Secure logging - no sensitive data
            logger.info(f"SQL executed successfully on {database} for user {username}")

            return {
                "success": True,
                "data": result,
                "database": database,
                "query": sql_query,
                "username": username,
                "row_count": len(result) if isinstance(result, list) else None
            }

        except Exception as e:
            # Secure logging - no sensitive data
            logger.error(f"Error executing SQL on {database} for user {credentials[0] if credentials else 'unknown'}: {e}")
            return {
                "success": False,
                "error": str(e),
                "database": database,
                "query": sql_query,
                "username": credentials[0] if credentials else "unknown"
            }


@bp.route('/tools', methods=['GET'])
def list_tools():
    """MCP list_tools endpoint."""
    if not MCP_AVAILABLE:
        return jsonify({"error": "MCP library not installed"}), 500

    try:
        tools = McpTools.create_tools()
        return jsonify({"tools": tools})
    except Exception as e:
        logger.error(f"Error listing tools: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/call_tool', methods=['POST'])
def call_tool():
    """MCP call_tool endpoint - handles only SQL execution."""
    if not MCP_AVAILABLE:
        return jsonify({"error": "MCP library not installed"}), 500

    try:
        data = request.get_json()
        if not data:
            raise BadRequest("Missing JSON data")

        tool_name = data.get("name")
        arguments = data.get("arguments", {})

        if not tool_name:
            raise BadRequest("Missing tool name")

        logger.info(f"Calling MCP tool: {tool_name} with arguments: {arguments}")

        # Route to appropriate tool handler
        if tool_name == "create_credential_token":
            username = arguments.get("username")
            password = arguments.get("password")
            database = arguments.get("database")
            expiry_minutes = arguments.get("expiry_minutes", 30)  # 30 minutes default

            if not all([username, password, database]):
                raise BadRequest("Missing required arguments: username, password, database")

            token = credential_manager.create_credential_token(username, password, database, expiry_minutes)

            response_text = f"Credential token created successfully for {database}.\n"
            response_text += f"Token expires in {expiry_minutes} minutes.\n"
            response_text += f"Use this token for execute_sql calls: {token}"

            return jsonify({
                "content": [{"type": "text", "text": response_text}]
            })

        elif tool_name == "execute_sql":
            database = arguments.get("database")
            sql_query = arguments.get("sql")
            credential_token = arguments.get("credential_token")

            if not all([database, sql_query, credential_token]):
                raise BadRequest("Missing required arguments: database, sql, credential_token")

            result = McpTools.execute_sql_query_with_token(database, sql_query, credential_token)

            # Get username for logging (without exposing password)
            username = result.get("username", "unknown")
            response_text = format_sql_response(database, username, sql_query, result)

            return jsonify({
                "content": [{"type": "text", "text": response_text}]
            })

        elif tool_name == "revoke_credential_token":
            credential_token = arguments.get("credential_token")

            if not credential_token:
                raise BadRequest("Missing required argument: credential_token")

            revoked = credential_manager.revoke_token(credential_token)

            if revoked:
                response_text = "Credential token revoked successfully."
            else:
                response_text = "Credential token not found or already expired."

            return jsonify({
                "content": [{"type": "text", "text": response_text}]
            })

        elif tool_name == "list_databases":
            databases = current_app.endpoints

            response_text = "Available databases for SQL execution:\n\n"
            for name, connection_string in databases.items():
                response_text += f"- {name}: {connection_string}\n"
            response_text += "\nNote: Create a credential token first using create_credential_token, then use that token for execute_sql calls."

            return jsonify({
                "content": [{"type": "text", "text": response_text}]
            })

        else:
            return jsonify({"error": f"Unknown tool: {tool_name}. Available tools: create_credential_token, execute_sql, revoke_credential_token, list_databases"}), 400

    except BadRequest as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Error calling tool: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route('/status', methods=['GET'])
def mcp_status():
    """MCP server status endpoint."""
    return jsonify({
        "status": "running",
        "mcp_available": MCP_AVAILABLE,
        "available_databases": McpTools.get_available_databases(),
        "available_tools": ["create_credential_token", "execute_sql", "revoke_credential_token", "list_databases"],
        "purpose": "SQL execution only - database introspection handled by api-server",
        "credential_manager": credential_manager.get_instance_info()
    })


@bp.route('/debug/credentials', methods=['GET'])
def debug_credentials():
    """Debug endpoint to check credential manager status."""
    return jsonify({
        "credential_manager_info": credential_manager.get_instance_info(),
        "timestamp": time.time()
    })