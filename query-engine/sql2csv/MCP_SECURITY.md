# MCP Security Architecture

## Overview

The MCP (Model Context Protocol) implementation includes a secure credential management system designed to eliminate password exposure in API calls and system logs while maintaining security best practices.

## Solution Architecture

### SharedCredentialManager

The system uses a `SharedCredentialManager` class that implements secure credential storage using `/dev/shm` (RAM-based filesystem):

#### Key Security Features:

1. **RAM-Only Storage**: Credentials stored in `/dev/shm` (memory filesystem)
   - No persistent disk storage
   - Automatically cleared on container restart
   - No password files left on filesystem

2. **Multi-Worker Support**: Works across Gunicorn worker processes
   - File-based locking for thread/process safety
   - Shared storage accessible by all workers
   - Consistent token access across load-balanced requests

3. **Secure Token Generation**:
   - Cryptographically secure tokens using `secrets.token_urlsafe(32)`
   - 256-bit entropy tokens
   - Unpredictable token values

4. **File Security**:
   - Restrictive permissions (600 - owner read/write only)
   - Atomic file operations with exclusive locking
   - Temporary file patterns for safe writes

5. **Automatic Cleanup**:
   - Expired tokens automatically removed
   - Cleanup on token access and creation
   - Manual revocation support

## Workflow

### Token Creation
```
1. User calls create_credential_token with username/password/database
2. System generates secure 32-byte token
3. Credentials stored in /dev/shm/mcp_credentials/token_<hash>.json
4. File permissions set to 600 (owner only)
5. Token returned to user
```

### Token Usage
```
1. User calls execute_sql with token (no password needed)
2. System looks up token in /dev/shm storage
3. Credentials retrieved and used for database connection
4. No password exposure in logs or API calls
```

### Token Cleanup
```
1. Automatic cleanup on expired tokens
2. Manual revocation available
3. All files cleared on container restart
4. No persistent credential storage
```

## Configuration

- **Default Expiry**: 30 minutes
- **Storage Location**: `/dev/shm/mcp_credentials/`
- **File Permissions**: 600 (owner read/write only)
- **Thread Safety**: File locking with `fcntl`

## Production Deployment

The system is designed for multi-worker Gunicorn deployments:

```dockerfile
CMD gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 \
    --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()"
```

Key requirements:
- `/dev/shm` must be available (standard in Docker containers)
- Multiple workers supported via shared filesystem storage
- Workers share credential tokens seamlessly


## MCP Tool Usage

### create_credential_token
Creates a secure token for database credentials:
```json
{
  "name": "create_credential_token",
  "arguments": {
    "database": "pdb21",
    "username": "RNTMGR2",
    "password": "secretpassword",
    "expiry_minutes": 30
  }
}
```

### execute_sql
Executes SQL using the secure token:
```json
{
  "name": "execute_sql",
  "arguments": {
    "database": "pdb21",
    "credential_token": "abc123...",
    "sql": "SELECT * FROM users"
  }
}
```

### revoke_credential_token
Immediately revokes a token:
```json
{
  "name": "revoke_credential_token",
  "arguments": {
    "credential_token": "abc123..."
  }
}
```