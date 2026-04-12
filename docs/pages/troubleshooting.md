* TOC
{:toc id="toc"}
# Troubleshooting

## Registered database does not appear in the UI drop down
Follow these steps if the database registration succeeds but some (or all) of your databases are missing.

### Call the /endpoints API
The `endpoints` API lists valid and invalid database connections. Call the API with no arguments to get a list of valid connections. Pass `status=invalid` as a GET parameter to identify invalid ones. Example:

```bash
curl http://localhost/endpoints?status=invalid
{"ora18xe":{"connectString":"ap884.visulate.net:91521/XEPDB1","error":"Get connection timed out after 5000 ms"}}
```

### Review the Docker container logs
The API Server writes log file entries when the connection fails. These can be accessed using `docker logs`:

```bash
# View recent logs from the API server
docker logs --tail 50 visapi

# Follow logs in real-time
docker logs -f visapi
```

You can also access the log files directly inside the container or on the VM host if volumes are mapped:
```bash
docker exec -it visapi head -n 50 /visulate-server/logs/combined.log
```

### Check your browser developer tools
Use the network tab to examine the request to the `/api/` endpoint. The response should match the expected list of databases. Make sure the **Object Filter** field in the UI is empty, as it adds a wildcard filter to the results which could exclude databases.

### Check the username, password and connect string
Verify the contents of `config/database.js` on the VM. This file holds the credentials that the API server reads on startup to establish connection pools. 

```bash
cd /home/visulate/config
cat database.js
```

### Test your firewall rules
Ensure the Visulate VM can reach the database server and port. Use SQL*Plus inside the container for a definitive test:
```bash
docker exec -it visapi sqlplus visulate@db_host:1521/service_name
```
See the [Network and Security guide](/pages/network-security.html) for detailed troubleshooting steps.

### Check the Visulate account permissions
The `VISULATE` account must have exactly `CREATE SESSION`, `SELECT_CATALOG_ROLE`, and `SELECT ANY DICTIONARY`. The API server rejects over-privileged accounts. Check the logs for errors like:
```json
{"level":"error","message":"Closing poolAlias system. Account has invalid privileges. Expected: 'CREATE SESSION,SELECT ANY DICTIONARY,SELECT_CATALOG_ROLE' ..."}
```

---

## Query Editor is not displayed in the UI
The Query Editor display is controlled by values in the `config/endpoints.json` file. 

1. **Verify matching entries**: The `namespace` in `database.js` must match the key in `endpoints.json`, and the `connectString` must match exactly.
2. **Restart Services**: If you modify these files, you must restart the containers:
   ```bash
   docker-compose down && docker-compose up -d
   ```

---

## AI Chatbot is not displayed in the UI
The **GOOGLE_AI_KEY** environment variable must be set in your `docker-compose.yaml` file.

1. **Check `docker-compose.yaml`**:
   ```yaml
   services:
     visapi:
       environment:
         - GOOGLE_AI_KEY=your_key_here
   ```
2. **Restart**: `docker-compose up -d` after making changes.
3. **Verify API**: Call `http://localhost/ai` to see if the feature is reported as enabled.

---

## Container fails to start (CrashLoop)
If a container like `visapi` or `vissql` keeps crashing:
1. **Check for Syntax Errors**: Use `docker logs visapi` to check for "SyntaxError" in your `database.js` file.
2. **Check Port Conflicts**: Ensure no other service is using port 80 or other exposed ports on the VM.
