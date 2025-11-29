# Agentic Interface

The api-server and query engine expose MCP endpoints. The api-server exposes `/mcp`. It provides tools to examine the Oracle data dictionary in a registered database. The query engine exposes `/mcp-sql` with tools to execute SQL queries against data tables in registered databases.

## Intelligent Oracle Agent

The `agent.py` file creates an intelligent AI agent powered by Google ADK that provides natural language access to Oracle database operations:

1. **Setup Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Google AI API key and Visulate URL
   ```

2. **Start the Agent**:
   ```bash
   # Option 1: Direct execution
   uv run adk web

   # Option 2: As a package module
   uv run -m visulate_ai_agent.agent

   # Option 3: Using the installed script (after pip install)
   visulate-agent
   ```

3. **Interact with the Agent**:
   The agent runs as an A2A service on port 10000 and can handle queries like:
   - *"Search for tables related to customer accounts"*
   - *"Show me the structure of the EMPLOYEES table"*
   - *"What are the top 10 highest paid employees?"*
   - *"Analyze the relationship between ORDERS and CUSTOMERS tables"*

## Direct MCP Access

The MCP endpoints can also be accessed directly from Gemini CLI by adding an mcpServers entry in your `.gemini/settings.json` file. For example, if Visulate for Oracle is running on myserver.com:

```
{
  "mcpServers": {
    "visulate": {
      "httpUrl": "https://myserver.com/mcp",
      "enabled": true,
      "trust": true
    },
    "visulate-query-engine": {
      "httpUrl": "https://myserver.com/mcp-sql",
      "enabled": true,
      "trust": true
    }
  },
  "security": {
    "auth": {
      "selectedType": "gemini-api-key"
    }
  },
  "ui": {
    "theme": "ANSI Light"
  }
}
```

They can also be accessed using the `mcp-test-client.py` file in this directory

1. Install [uv](https://docs.astral.sh/uv/getting-started/installation/)

    ```
    # macOS and Linux
    curl -LsSf https://astral.sh/uv/install.sh | sh

    # Windows (uncomment below line)
    # powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    ```

2. Configure a `.env` file:

    ```
    GOOGLE_API_KEY=<your_api_key_here>
    VISULATE_BASE=https://myserver.com
    ```
    Get an API Key from Google AI Studio: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

3. *Optional* edit the prompts in `mcp-test-client.py` to reference your registered databases

4. Run:

    ```
    uv run mcp-test-client.py
    ```