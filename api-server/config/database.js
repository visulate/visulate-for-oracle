const endpoints = [
    {
        namespace: 'pdb21',
        description: '40GB Database',
        connect: {
            poolAlias: 'pdb21',
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
            user: 'visulate',
            password: 'visLand32754',
            connectString: 'vis25adb_tp',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
        }
    }
];
module.exports.endpoints = endpoints;
