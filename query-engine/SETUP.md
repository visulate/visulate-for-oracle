# MCP Integration for Visulate Query Engine

## Overview

MCP (Model Context Protocol) endpoints have been integrated into the Flask query engine to provide **SQL execution**. Database introspection (listing tables, schemas, etc.) is handled by the api-server, which has read-only access to the data dictionary.

## Architecture & Purpose

```
MCP Client → Flask Query Engine (/mcp/execute_sql) → Oracle Database (with user credentials)
           ↗
API Server → Oracle Database (data dictionary access only)
```

**Division of Responsibilities:**
- **API Server**: Database introspection, schema analysis, query generation (uses privileged read-only user)
- **Query Engine**: SQL execution against actual data tables (uses provided user credentials)

## Use Case Example

1. **User Request**: "List tenants in the Florida business unit who are late on rental payments in pdb21"
2. **API Server**: Analyzes schema, generates SQL query using data dictionary access
3. **Generated Query**:
```sql
SELECT P.FIRST_NAME, P.LAST_NAME, AR.PAYMENT_DUE_DATE, AR.AMOUNT AS AMOUNT_DUE
FROM RNT_ACCOUNTS_RECEIVABLE AR
JOIN RNT_TENANT T ON AR.TENANT_ID = T.TENANT_ID
JOIN RNT_BUSINESS_UNITS BU ON AR.BUSINESS_ID = BU.BUSINESS_ID
JOIN RNT_PEOPLE P ON T.PEOPLE_ID = P.PEOPLE_ID
WHERE BU.BUSINESS_NAME = 'Florida'
AND AR.PAYMENT_DUE_DATE < SYSDATE
AND NOT EXISTS (SELECT 1 FROM RNT_PAYMENT_ALLOCATIONS PA WHERE PA.AR_ID = AR.AR_ID);
```
4. **Query Engine**: Executes query using RNTMGR2 schema credentials (provided by user)

## MCP Endpoints

- **GET `/mcp/tools`** - List available MCP tools (execute_sql, list_databases)
- **POST `/mcp/call_tool`** - Execute SQL queries with user credentials
- **GET `/mcp/status`** - Service status

## Available MCP Tools

1. **execute_sql**: Execute SQL queries with username/password credentials
   - Required: database, sql, username, password
   - Purpose: Run queries against actual data tables

2. **list_databases**: Show available database endpoints
   - Purpose: Display configured databases from endpoints.json

## Authentication Model

The query engine requires **actual database user credentials** for SQL execution:

```json
{
  "name": "execute_sql",
  "arguments": {
    "database": "pdb21",
    "sql": "SELECT...",
    "username": "RNTMGR2",
    "password": "user_provided_password"
  }
}
```

## Example Usage

### Execute SQL Query
```bash
curl -X POST http://localhost:5000/mcp/call_tool \
  -H "Content-Type: application/json" \
  -d '{
    "name": "execute_sql",
    "arguments": {
      "database": "pdb21",
      "sql": "SELECT COUNT(*) FROM RNT_ACCOUNTS_RECEIVABLE WHERE PAYMENT_DUE_DATE < SYSDATE",
      "username": "RNTMGR2",
      "password": "schema_password"
    }
  }'
```

### List Available Databases
```bash
curl -X POST http://localhost:5000/mcp/call_tool \
  -H "Content-Type: application/json" \
  -d '{
    "name": "list_databases",
    "arguments": {}
  }'
```

## Workflow Integration

1. **Schema Analysis**: API server uses privileged read-only access to analyze database structure
2. **Query Generation**: API server generates appropriate SQL based on user request and schema knowledge
3. **Credential Request**: System prompts user for schema password when first needed in session
4. **Query Execution**: Query engine executes generated SQL using provided user credentials
5. **Result Return**: Query results returned to user via MCP client

## Security Model

- **Query Engine**: Validates SQL is SELECT-only, uses user-provided credentials
- **API Server**: Uses privileged read-only account for data dictionary access only
- **Credential Separation**: API server cannot execute queries on data tables, query engine cannot read data dictionary

## Testing

### 1. Start Flask App
```bash
cd git/visulate-for-oracle
docker-compose up vissql
```

### 2. Check MCP Status
```bash
curl http://localhost:5000/mcp/status
```

Expected response:
```json
{
  "status": "running",
  "mcp_available": true,
  "available_databases": ["vis24prod", "vis24win"],
  "available_tools": ["execute_sql", "list_databases"],
  "purpose": "SQL execution only - database introspection handled by api-server"
}
```