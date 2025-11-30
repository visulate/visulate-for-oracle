import os

def get_mcp_urls():
    """Get MCP endpoint URLs based on environment configuration"""
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
