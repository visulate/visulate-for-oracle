/**
 * Database connection endpoints
 * namespace: Unique identifier for the database (used in API URLs)
 * description: Display name
 * connect:
 *   poolAlias: Unique identifier for the connection pool
 *   dbType: (Optional) 'oracle' or 'postgres'. Defaults to 'oracle' if not specified.
 *   ... connection parameters
 */
const endpoints = [
    {
        namespace: 'pdb21',
        description: '40GB Database',
        connect: {
            poolAlias: 'pdb21',
            dbType: 'oracle',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.170:1522/pdb21.goldthorp.org',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
        }
    },
    {
        namespace: 'pdb22',
        description: '7GB Database',
        connect: {
            poolAlias: 'pdb22',
            dbType: 'oracle',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.170:1522/pdb22.goldthorp.org',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
        }
    },
    {
        namespace: 'pdb23',
        description: 'Test Database',
        connect: {
            poolAlias: 'pdb23',
            dbType: 'oracle',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.170:1522/pdb23.goldthorp.org',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
        }
    },
    {
        namespace: 'vis25adb',
        description: 'Test Database',
        connect: {
            poolAlias: 'vis25adb',
            dbType: 'oracle',
            user: 'visulate',
            password: 'visLand32754',
            connectString: 'vis25adb_tp',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
        }
    },
    {
      namespace: 'vis25adb_tp',
      description: 'vis25adb_tp Database',
      connect: { poolAlias: 'vis25adb_tp',
                 dbType: 'oracle',
                 user: 'visulate',
                 password: 'visLand32754',
                 connectString: '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1521)(host=adb.us-ashburn-1.oraclecloud.com))(connect_data=(service_name=tryngjlosd4mgon_vis25adb_tp.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))',
                 poolMin: 4,
                 poolMax: 4,
                 poolIncrement: 0
               }
    },	
    {
        namespace: 'cmbs-postgres',
        description: 'CMBS Postgres Database',
        connect: {
            poolAlias: 'cmbs-postgres',
            dbType: 'postgres',
            user: 'visulate',
            password: 'visLand32754',
            connectString: 'localhost:5432/cmbs'
        }
    }
];
module.exports.endpoints = endpoints;
