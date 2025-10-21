"""
MCP (Model Context Protocol) blueprint for the Visulate query engine.
Provides MCP-compatible endpoints for SQL execution.
"""

import json
import logging
from flask import Blueprint, request, jsonify, current_app
from werkzeug.exceptions import BadRequest

# Import MCP types and server components
try:
    from mcp.types import Tool, TextContent, CallToolRequest, ListToolsRequest
    from mcp.server import Server
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False

# Import local SQL execution functions
from . import sql2csv

bp = Blueprint('mcp', __name__, url_prefix='/mcp')

logger = logging.getLogger(__name__)


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
                    username = arguments.get("username")
                    password = arguments.get("password")

                    if not all([database, sql_query, username, password]):
                        return jsonify({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"code": -32602, "message": "Missing required arguments: database, sql, username, password"}
                        }), 400

                    result = McpTools.execute_sql_query(database, sql_query, username, password)

                    if result["success"]:
                        response_text = f"Query executed successfully on {database} as {username}:\n\n"
                        response_text += f"SQL: {sql_query}\n\n"
                        if result.get("row_count") is not None:
                            response_text += f"Rows returned: {result['row_count']}\n\n"
                        response_text += f"Results:\n{json.dumps(result['data'], indent=2)}"
                    else:
                        response_text = f"Query failed on {database} as {username}:\n\n"
                        response_text += f"SQL: {sql_query}\n\n"
                        response_text += f"Error: {result['error']}"

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
                    response_text += "\nNote: You'll need valid database credentials (username/password) to execute queries."

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
                "name": "execute_sql",
                "description": "Execute a SQL query on a specified database. Used when the api-server generates a query that needs to be executed against actual data tables (not data dictionary).",
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
                        "username": {
                            "type": "string",
                            "description": "Database username (e.g., schema owner like RNTMGR2)"
                        },
                        "password": {
                            "type": "string",
                            "description": "Database password for the username"
                        }
                    },
                    "required": ["database", "sql", "username", "password"]
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
    def execute_sql_query(database, sql_query, username, password):
        """Execute SQL using existing sql2csv functionality."""
        try:
            # Use the internal SQL execution function
            result = sql2csv.execute_sql_internal(database, sql_query, username, password)

            return {
                "success": True,
                "data": result,
                "database": database,
                "query": sql_query,
                "username": username,
                "row_count": len(result) if isinstance(result, list) else None
            }

        except Exception as e:
            logger.error(f"Error executing SQL: {e}")
            return {
                "success": False,
                "error": str(e),
                "database": database,
                "query": sql_query,
                "username": username
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
        if tool_name == "execute_sql":
            database = arguments.get("database")
            sql_query = arguments.get("sql")
            username = arguments.get("username")
            password = arguments.get("password")

            if not all([database, sql_query, username, password]):
                raise BadRequest("Missing required arguments: database, sql, username, password")

            result = McpTools.execute_sql_query(database, sql_query, username, password)

            if result["success"]:
                response_text = f"Query executed successfully on {database} as {username}:\n\n"
                response_text += f"SQL: {sql_query}\n\n"
                if result.get("row_count") is not None:
                    response_text += f"Rows returned: {result['row_count']}\n\n"
                response_text += f"Results:\n{json.dumps(result['data'], indent=2)}"
            else:
                response_text = f"Query failed on {database} as {username}:\n\n"
                response_text += f"SQL: {sql_query}\n\n"
                response_text += f"Error: {result['error']}"

            return jsonify({
                "content": [{"type": "text", "text": response_text}]
            })

        elif tool_name == "list_databases":
            databases = current_app.endpoints

            response_text = "Available databases for SQL execution:\n\n"
            for name, connection_string in databases.items():
                response_text += f"- {name}: {connection_string}\n"
            response_text += "\nNote: You'll need valid database credentials (username/password) to execute queries."

            return jsonify({
                "content": [{"type": "text", "text": response_text}]
            })

        else:
            return jsonify({"error": f"Unknown tool: {tool_name}. Available tools: execute_sql, list_databases"}), 400

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
        "available_tools": ["execute_sql", "list_databases"],
        "purpose": "SQL execution only - database introspection handled by api-server"
    })