const endpoints = [
{ namespace: 'oracle18XE',
  description: '18c XE pluggable database instance running in a docker container',
  connect: { poolAlias: 'oracle18XE',
            user: 'visulate',
            password: 'HtuUDK%?4JY#]L3:',
            connectString: 'db225.visulate.net:41521/XEPDB1',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
          }
},
{ namespace: 'oracle11XE',
  description: '11.2 XE database',
  connect: { poolAlias: 'oracle11XE',
            user: 'visulate',
            password: '7>rC4P?!~U42tS^^',
            connectString: 'db225.visulate.net:49161/XE',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
          }
}
];
module.exports.endpoints = endpoints;
