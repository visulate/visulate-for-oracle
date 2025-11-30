import os

def get_mcp_urls():
    """
    Get MCP endpoint URLs based on environment configuration.
    Returns:
        tuple: (api_server_url, query_engine_url)
            - api_server_url: URL for the MCP API server endpoint.
            - query_engine_url: URL for the MCP SQL query engine endpoint.
    The returned URLs depend on the environment:
        - Local development without reverse proxy (e.g., "http://localhost"):
            api_server_url: "http://localhost:3000/mcp"
            query_engine_url: "http://localhost:5000/mcp-sql"
        - Local development with specific port (e.g., "http://localhost:3000"):
            api_server_url: "http://localhost:3000/mcp"
            query_engine_url: "http://localhost:5000/mcp-sql"
        - Production with reverse proxy (e.g., "https://visulate.example.com"):
            api_server_url: "https://visulate.example.com/mcp"
            query_engine_url: "https://visulate.example.com/mcp-sql"
    """
    visulate_base = os.getenv("VISULATE_BASE", "http://localhost")
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

    return api_server_url, query_engine_url
