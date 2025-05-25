const endpoints = [
{ namespace: 'vis24prod',
    description: 'Visulate 2024',
    connect: { poolAlias: 'vis24prod',
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
            connectString: 'visulate.goldthorp.org:1521/vis24pdb',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
}
];
module.exports.endpoints = endpoints;
