const endpoints = [
{ namespace: 'vis24',
    description: 'Visulate 2024',
    connect: { poolAlias: 'vis24',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.153:1521/orclpdb',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
},
{ namespace: 'vis24win',
    description: 'Visulate 2024 Windows Instance',
    connect: { poolAlias: 'vis24win',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.28:1521/vis24pdb',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
},
{ namespace: 'pdb21',
    description: '40GB Database',
    connect: { poolAlias: 'pdb21',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.170:1522/pdb21.goldthorp.org',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
},
{ namespace: 'pdb22',
    description: '7GB Database',
    connect: { poolAlias: 'pdb22',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.170:1522/pdb22.goldthorp.org',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
},
{ namespace: 'pdb23',
    description: 'Test Database',
    connect: { poolAlias: 'pdb23',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.170:1522/pdb23.goldthorp.org',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
},
{ namespace: 'adb25',
    description: 'Oracle ADB Free Database',
    connect: { poolAlias: 'adb25',
            user: 'visulate',
            password: 'visLand32754',
            connectString: 'vis25adb_high',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
}
];
module.exports.endpoints = endpoints;
