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
}
];
module.exports.endpoints = endpoints;
