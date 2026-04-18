* TOC
{:toc id="toc"}

# Database Setup and Registration

This guide describes how to prepare an Oracle database for use with Visulate and register it in the application catalog.

## Step 1: Database Account Setup
Visulate for Oracle needs to read the data dictionary in each registered database. Create a dedicated user with the minimum required privileges in each database you want to catalog.

### Create the VISULATE user
Login to SQL*Plus as SYSTEM and create a database user called "VISULATE" and grant CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY privileges:

```sql
create user visulate identified by &password;
alter user visulate account unlock;
grant create session to visulate;
grant select any dictionary to visulate;
grant select_catalog_role to visulate;
```

### Why these privileges?
- **CREATE SESSION**: Required for database connections.
- **SELECT ANY DICTIONARY**: Grants Read access on Data Dictionary tables owned by SYS (excluding sensitive password/history tables). Visulate accesses some tables directly for performance.
- **SELECT_CATALOG_ROLE**: Required for `DBMS_METADATA` calls used by the DDL download and AI documentation features.

> [!IMPORTANT]
> For security, the account must be called "VISULATE" and must not have additional privileges. The API server verifies these privileges on startup and will reject connections that are over-privileged.

---

## Step 2: Database Registration
Each database in the Visulate catalog must be registered. The API server maintains a connection pool for each registration, read from a configuration file on the VM.

### The registration file (`database.js`)
The registration file is located at `/home/visulate/config/database.js`. It exports a JavaScript array with connection details.

**Sample `database.js`:**
```javascript
const endpoints = [
 { namespace: 'prod_db',
    description: 'Production Database',
    connect: { poolAlias: 'prod_db',
              user: 'visulate',
              password: 'YourSecurePassword',
              connectString: 'prod-scan.internal:1521/PROD',
              poolMin: 4,
              poolMax: 4,
              poolIncrement: 0
            }
  }
];
module.exports.endpoints = endpoints;
```

---

## Step 3: Registration on VM
In a VM deployment, follow these steps to register a new connection:

1. **SSH into the VM**: Connect to your Visulate instance.
2. **Edit the Config**:
   ```bash
   cd /home/visulate
   sudo vi config/database.js
   ```
3. **Add Connection Details**: Add a new object to the `endpoints` array following the sample above.
4. **Restart Services**:
   ```bash
   docker-compose down && docker-compose up -d
   ```

### SQL Query Engine Registration
To enable Natural Language to SQL (NL2SQL) and CSV export features, you must also map the endpoint in `config/endpoints.json`.

1. **Edit the Endpoints**:
   ```bash
   sudo vi config/endpoints.json
   ```
2. **Add Mapping**: The key must match the `namespace` used in `database.js`.
   ```json
   {"prod_db": "prod-scan.internal:1521/PROD"}
   ```

---

## Specialized Environments

### Oracle Autonomous Database (ADB)
Connections to Oracle Autonomous Data Warehouse (ADW) or Transaction Processing (ATP) can be created with or without a wallet. For connections that, require a client credentials wallet.

1. **Upload Wallet**: Place the unzipped wallet files in a directory on the VM (e.g., `/home/visulate/wallets/mydb`).
2. **Update `database.js`**:
   ```javascript
   { namespace: 'my_adb',
     description: 'Autonomous Database',
     connect: { poolAlias: 'my_adb',
                user: 'visulate',
                password: 'YourPassword',
                connectString: 'my_adb_high',
                externalAuth: false
              },
     tnsAdmin: '/visulate-server/config/wallets/mydb'
   }
   ```
   *Note: `/visulate-server/config` inside the container maps to `/home/visulate/config` on the VM host.*

3. **Update `endpoints.json` for NL2SQL**:
   ```json
   {
     "my_adb": {
         "dsn": "my_adb_high",
         "wallet_location": "/usr/src/app/wallet"
     }
   }
   ```

### Oracle E-Business Suite (EBS)
EBS databases contain thousands of schemas and tens of thousands of packages. Visulate provides a specialized **Product Prefix Navigation Filter** to handle this volume.

- **Object Search**: Access EBS objects directly by name (e.g., `AP_BANK_ACCOUNTS_ALL`).
- **Product Filtering**: Select a product prefix (e.g., `AR_` for Receivables) to limit the schema and object lists to relevant items, significantly improving navigation speed in high-density environments.

---

## Verification
Call the `endpoints` API or check the UI dropdown:
```bash
curl http://localhost/endpoints/
```
