const endpoints = [
{ namespace: 'vis24',
    description: 'Visulate 2024',
    connect: { poolAlias: 'vis24',
            user: 'visulate',
            password: 'visLand32754',
            connectString: '192.168.1.152:1521/orclpdb',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
}
];
module.exports.endpoints = endpoints;
