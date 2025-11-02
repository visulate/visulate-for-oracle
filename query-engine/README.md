# sql2csv

Generates a csv file from SQL with secure MCP (Model Context Protocol) support.

## Architecture

The query engine consists of several key components:

### Core Files
- **`sql2csv/sql2csv.py`** - Core SQL execution engine with Oracle database connectivity
- **`sql2csv/__init__.py`** - Flask application factory and module configuration
- **`sql2csv/config/`** - Configuration directory containing database endpoints

### MCP Security Layer
- **`sql2csv/mcp.py`** - MCP endpoints providing secure SQL execution for AI agents
- **`sql2csv/secure_credentials.py`** - Secure credential management with RAM-only storage
- **`sql2csv/MCP_SECURITY.md`** - Comprehensive security architecture documentation

## MCP Security Features

The query engine implements enterprise-grade security for AI-driven database access:

- **🔒 Secure Token System**: Eliminates password exposure in API calls and logs
- **💾 RAM-Only Storage**: Credentials stored in `/dev/shm` with no disk persistence
- **🔄 Multi-Worker Support**: Works across Gunicorn workers using shared filesystem
- **⏱️ Auto-Expiration**: Configurable token expiry (default: 30 minutes)
- **🧹 Automatic Cleanup**: Expired tokens automatically removed
- **🔐 File Security**: Restrictive permissions (600) and atomic operations

See `sql2csv/MCP_SECURITY.md` for complete security architecture details.

## Start development server

```
source venv/bin/activate
export FLASK_APP=sql2csv
flask run
```

## Test Suite

Tests are located in `query-engine/tests` directory and require a `sql2csv/config/endpoints.json` file:
```
{"oracle18XE":"db205.visulate.net:41521/XEPDB1"}
```
and a matching `tests/config.json` file:
```
{
    "validEndpoint": "oracle18XE",
    "validCredentials": "visulate:visPassword",
    "validConnectString": "db205.visulate.net:41521/XEPDB1"
}
```
Execute the tests by running `pytest` from the `query-engine` directory or via Test interface in VS Code

## MCP Endpoint Usage

The query engine provides secure MCP (Model Context Protocol) endpoints for AI agents:

### Secure Workflow
1. **Create Token**: Use `/mcp/create_credential_token` to generate a secure token
2. **Execute SQL**: Use `/mcp/execute_sql` with the token (no password needed)
3. **Revoke Token**: Use `/mcp/revoke_credential_token` when done

### Example: Creating a Credential Token
```bash
curl -X POST http://localhost:5000/mcp/create_credential_token \
  -H "Content-Type: application/json" \
  -d '{
    "database": "pdb21",
    "username": "RNTMGR2",
    "password": "your_password",
    "expiry_minutes": 60
  }'
```

### Example: Executing SQL with Token
```bash
curl -X POST http://localhost:5000/mcp/execute_sql \
  -H "Content-Type: application/json" \
  -d '{
    "database": "pdb21",
    "credential_token": "your_secure_token_here",
    "sql": "SELECT COUNT(*) FROM user_tables"
  }'
```

## Build instructions

Create a distribution package:

```
python3 setup.py bdist_wheel
```

Generate local config file
```
mkdir ${HOME}/config/
curl localhost:3000/endpoints > ${HOME}/config/endpoints.json
```

Build and run:

```
docker build --rm -t sql2csv:latest .
docker run -d -p 5000:5000 -e CORS_ORIGIN_WHITELIST=http://localhost:4200 \
  -v ${HOME}/config:/query-engine/sql2csv/config/ sql2csv:latest
```

## Production Deployment

The Dockerfile is configured for production with multi-worker Gunicorn:

```dockerfile
CMD gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 \
    --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()"
```

**Key Features:**
- **Multi-Worker**: 2 Gunicorn workers for concurrent request handling
- **Shared Storage**: Uses `/dev/shm` for secure credential sharing between workers
- **Thread Safety**: 4 threads per worker with thread-safe credential management
- **Security**: RAM-only credential storage with automatic cleanup

# Manual Testing
```
echo -n username:password| base64
dXNlcm5hbWU6cGFzc3dvcmQ=

curl --location --request POST 'localhost:5000/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: text/csv' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties where rownum < :r",
 "binds": {"r":9}}'

76374,"819 OLIVE AVE","TITUSVILLE","32780"
76376,"1175 THIRD AVE","TITUSVILLE","32780"
76378,"1165 THIRD AVE","TITUSVILLE","32780"
76379,"1180 THIRD AVE","TITUSVILLE","32780"
76380,"805 WARREN CT W","TITUSVILLE","32780"
76384,"4434 EVER PL","ORLANDO","32811"
76385,"810 WARREN CT W","TITUSVILLE","32780"
76386,"810 WARREN ST W","TITUSVILLE","32780"

## or using positional bind var:

curl --location --request POST 'localhost:5000/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: text/csv' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties where rownum < :r",
 "binds": [9]}'

## or no bind variables:

 curl --location --request POST 'localhost:5000/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: application/json' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties"}'

```
