const app = require('../app');
let chai = require('chai'), chaiHttp = require('chai-http');
let should = chai.should();
let expect = chai.expect;
chai.use(chaiHttp);

const NON_PDB =  process.env.VISULATE_NON_PDB || 'oracle11XE';
const PDB =  process.env.VISULATE_PDB ||'oracle18XE';

const BASE_URL = 'http://localhost:3000';

before((done) => {
  app.eventEmitter.on("httpServerStarted", function(){
    done();
  });
});

after(async (done) => {
  let e;
  await app.shutdown(e);
  done();
});

it('GET endpoints should return object type count', (done) => {
  chai.request(BASE_URL)
  .get('/')
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('object');
    res.body.endpoints.should.be.a('array');
    res.body.endpoints[0].schemas.should.be.a('object');
    done();
  });
});

it('GET /api endpoints should return object type count', (done) => {
  chai.request(BASE_URL)
  .get('/api')
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('object');
    res.body.endpoints.should.be.a('array');
    done();
  });
});

it('GET /endpoints should return object type count', (done) => {
  chai.request(BASE_URL)
  .get('/endpoints')
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('object');
    done();
  });
});

it('GET /api-docs should return swagger-ui', (done) => {
  chai.request(BASE_URL)
  .get('/api-docs')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('GET filtered /api endpoints should return filtered object type count', (done) => {
  chai.request(BASE_URL)
  .get('/api?filter=DBA_*')
  .end((err, res) => {
    //console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(200);
    res.body.should.be.a('object');
    res.body.endpoints.should.be.a('array');
    done();
  });
});

it('GET invalid endpoint should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/api/xxInvalidxx/WIKI/TABLE/*/*')
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Requested database was not found');
    done();
  });
});

it('GET PDB invalid schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/xxInvalidSchema/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('No objects found for the requested owner, type, name and status');
    done();
  });
});

it('GET 11i invalid schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/xxInvalidSchema/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('No objects found for the requested owner, type, name and status');
    done();
  });
});

/**
 * Find Tests
 */
it('GET Simple Search', (done) => {
  chai.request(BASE_URL)
  .get(`/find/rnt_menus_pkg`)
  .end((err, res) => {
  //  console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(200);
    res.body.result.should.be.a('array');
    res.body.result.length.should.equal(2);
    res.body.result[1].objects.length.should.equal(2);
    done();
  });
});

it('GET find with no results', (done) => {
  chai.request(BASE_URL)
  .get(`/find/xxInvalidName`)
  .end((err, res) => {
    //console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(200);
    res.body.result.should.be.a('array');
    res.body.result.length.should.equal(2);
    res.body.result[1].objects.length.should.equal(0);
    done();
  });
});

/**
 * Database Report
 */
it('GET PDB Database summary', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}`)
  .end((err, res) => {
  //  console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
  //  res.body.length.should.equal(9);
    done();
  });
});
it('GET 11i Database summary', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
  //  res.body.length.should.equal(9);
    done();
  });
});

it('GET invalid DB should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/invalidDB`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    done();
  });
});

/**
 * Schema Report
 */
it('GET PDB schema summary', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(5);
  //  console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});
it('GET 11i schema summary', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(5);
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('GET PDB schema summary with query filter', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI?filter=rnt_user*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(5);
  //  console.log(JSON.stringify(res.body, null, 2));
    res.body[4].rows.length.should.equal(0);
    done();
  });
});

it('GET invalid PDB schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/InValid`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    done();
  });
});
it('GET invalid 11i schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/InValid`)
  .end((err, res) => {
    //console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(404);
    done();
  });
});

/**
 * DDL Generation
 */
it('GET PDB DDL', (done) => {
  chai.request(BASE_URL)
  .get(`/ddl/${PDB}/WIKI/PACKAGE BODY/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('GET DDL for SYS object should return 403', (done) => {
  chai.request(BASE_URL)
  .get(`/ddl/${PDB}/SYS/VIEW/DBA_USERS/VALID`)
  .end((err, res) => {
    expect(res).to.have.status(403);
    done();
  });
});


/**
 * Find Objects
 */
it('GET PDB TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/TABLE`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(10);
    res.body[0].should.equal("RNT_LOOKUP_TYPES");
    res.body[9].should.equal("RNT_USER_ROLES");
    done();
  });
});

it('GET PDB TABLES + wildcard should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(10);
    res.body[0].should.equal("RNT_LOOKUP_TYPES");
    res.body[9].should.equal("RNT_USER_ROLES");
    done();
  });
});

it('GET 11i TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/TABLE`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(10);
    res.body[0].should.equal("RNT_LOOKUP_TYPES");
    res.body[9].should.equal("RNT_USER_ROLES");
    done();
  });
});

it('GET 11i TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(10);
    res.body[0].should.equal("RNT_LOOKUP_TYPES");
    res.body[9].should.equal("RNT_USER_ROLES");
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('Filtered PDB GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/PACKAGE BODY/RNT_MENU*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(5);
    res.body[0].should.equal("RNT_MENUS_PKG");
    res.body[4].should.equal("RNT_MENU_TABS_PKG");
    done();
  });
});

it('Filtered 11i GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/PACKAGE BODY/RNT_MENU*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(5);
    res.body[0].should.equal("RNT_MENUS_PKG");
    res.body[4].should.equal("RNT_MENU_TABS_PKG");
    done();
  });
});

it('GET PDB invalid object_name should return a 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/PACKAGE BODY/xxInvalidObjectName/*`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    done();
  });
});

it('GET 11i invalid object_name should return a 404', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/PACKAGE BODY/xxInvalidObjectName/*`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    done();
  });
});


it('Filtered PDB GET list of invalid package bodies should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/PACKAGE BODY/*/invalid`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    res.body[0].should.equal("RNT_USERS_PKG");
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('Filtered 11i GET list of invalid package bodies should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/PACKAGE BODY/*/invalid`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    res.body[0].should.equal("RNT_USERS_PKG");
    done();
  });
});

it('PDB GET with filter query', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/PACKAGE BODY?filter=rnt_users_*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    res.body[0].should.equal("RNT_USERS_PKG");
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('11i GET with filter query', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/PACKAGE BODY?filter=rnt_users_*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    res.body[0].should.equal("RNT_USERS_PKG");
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});


it('Wildcard PDB GET list', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/*/RNT_*/invalid`)
  .end((err, res) => {
//    console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    done();
  });
});

it('Wildcard 11i GET list', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/*/RNT_*/invalid`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    //console.log(JSON.stringify(res.body, null, 2));
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    done();
  });
});

/**
 * Show Object
 */
it('PDB SQL injection attempt should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/api/' + PDB + "/WIKI/TABLE/ OR 1=1;")
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Database object was not found');
    done();
  });
});

it('11i SQL injection attempt should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/api/' + NON_PDB + "/WIKI/TABLE/ OR 1=1;")
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Database object was not found');
    done();
  });
});

it('PDB Show package body', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/PACKAGE BODY/RNT_MENUS_PKG`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[0].title.should.equal("Object Details");
    res.body[0].rows[0]["Object Name"].should.equal("RNT_MENUS_PKG");
    res.body[1].title.should.equal("Source");
    res.body[2].title.should.equal("SQL Statements");
    res.body[2].rows[0]["Line"].should.equal(20);
    res.body[2].rows.length.should.equal(5);
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('11i Show package body', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/PACKAGE BODY/RNT_MENUS_PKG`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[0].title.should.equal("Object Details");
    res.body[0].rows[0]["Object Name"].should.equal("RNT_MENUS_PKG");
    res.body[1].title.should.equal("Source");
    res.body[2].title.should.equal("SQL Statements");
    res.body[2].rows[0]["Line"].should.equal(20);
   // console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('PDB Invalid package body should show errors', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/PACKAGE BODY/RNT_USERS_PKG`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[1].title.should.equal("Error Details");
    res.body[1].rows[0]["Line"].should.equal(61);
    done();
  });
});

it('11i Invalid package body should show errors', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/PACKAGE BODY/RNT_USERS_PKG`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[1].title.should.equal("Error Details");
    res.body[1].rows[0]["Line"].should.equal(61);
    done();
  });
});

it('PDB Show Table', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/TABLE/RNT_MENUS`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[0].title.should.equal("Object Details");
    res.body[0].rows[0]["Object Name"].should.equal("RNT_MENUS");
    res.body[1].title.should.equal("Table Details");
    res.body[1].rows[0]["Temporary"].should.equal("N");
    res.body[2].title.should.equal("Table Description");
    res.body[2].rows[0]["Description"].should.equal("Records details of L3 menus for display on the left of the screen");
    res.body[3].title.should.equal("Indexes");
    res.body[3].rows.length.should.equal(1);
    res.body[4].title.should.equal("Functional Index Expressions");
    res.body[4].rows.length.should.equal(0);
    res.body[5].title.should.equal("Constraints");
    res.body[5].rows.length.should.equal(6);
    res.body[5].rows[1]["Name"].should.equal("RNT_MENUS_R1")
    res.body[6].title.should.equal("Columns");
    res.body[6].rows.length.should.equal(5);
    res.body[7].title.should.equal("Foreign Keys");
    res.body[7].rows.length.should.equal(1);
    res.body[7].rows[0]["Table"].should.equal("RNT_MENU_TABS")
    res.body[8].title.should.equal("Foreign Keys to this Table");
    res.body[8].rows.length.should.equal(2);
    res.body[9].title.should.equal("Used By");
    res.body[9].rows.length.should.equal(3);
    res.body[10].title.should.equal("Uses");
    res.body[10].rows.length.should.equal(0);
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('11i Show Table', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/TABLE/RNT_MENUS`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[0].title.should.equal("Object Details");
    res.body[0].rows[0]["Object Name"].should.equal("RNT_MENUS");
    res.body[1].title.should.equal("Table Details");
    res.body[1].rows[0]["Temporary"].should.equal("N");
    res.body[2].title.should.equal("Table Description");
    res.body[2].rows[0]["Description"].should.equal("Records details of L3 menus for display on the left of the screen");
    res.body[3].title.should.equal("Indexes");
    res.body[3].rows.length.should.equal(1);
    res.body[4].title.should.equal("Functional Index Expressions");
    res.body[4].rows.length.should.equal(0);
    res.body[5].title.should.equal("Constraints");
    res.body[5].rows.length.should.equal(6);
    res.body[5].rows[1]["Name"].should.equal("RNT_MENUS_R1")
    res.body[6].title.should.equal("Columns");
    res.body[6].rows.length.should.equal(5);
    res.body[7].title.should.equal("Foreign Keys");
    res.body[7].rows.length.should.equal(1);
    res.body[7].rows[0]["Table"].should.equal("RNT_MENU_TABS")
    res.body[8].title.should.equal("Foreign Keys to this Table");
    res.body[8].rows.length.should.equal(2);
    res.body[9].title.should.equal("Used By");
    res.body[9].rows.length.should.equal(3);
    res.body[10].title.should.equal("Uses");
    res.body[10].rows.length.should.equal(0);
    //console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('PDB VIEW object should have USES dependencies', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/VIEW/RNT_MENUS_V`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    //console.log(JSON.stringify(res.body, null, 2));
    res.body.should.be.a('array');
    res.body[6].title.should.equal("Uses");
    res.body[6].rows.length.should.equal(2);
    res.body[6].rows[0]["Object Name"].should.equal("RNT_MENUS");
    res.body[6].rows[1]["Object Name"].should.equal("RNT_SYS_CHECKSUM_REC_PKG");
    done();
  });
});

it('11i VIEW object should have USES dependencies', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/VIEW/RNT_MENUS_V`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    //console.log(JSON.stringify(res.body, null, 2));
    res.body.should.be.a('array');
    res.body[6].title.should.equal("Uses");
    res.body[6].rows.length.should.equal(2);
    res.body[6].rows[0]["Object Name"].should.equal("RNT_MENUS");
    res.body[6].rows[1]["Object Name"].should.equal("RNT_SYS_CHECKSUM_REC_PKG");
    done();
  });
});

it('PDB Get request for object with no collection SQL should not fail', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${PDB}/WIKI/SEQUENCE/RNT_USERS_SEQ`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[0].title.should.equal("Object Details");
    res.body[0].rows[0]["Object Name"].should.equal("RNT_USERS_SEQ");
    res.body[0].rows[0]["Type"].should.equal("SEQUENCE");
    res.body[0].rows[0]["Owner"].should.equal("WIKI");
    res.body[1].title.should.equal("Used By");
    res.body[1].rows.length.should.equal(1);
    res.body[1].rows[0].LINK.should.equal("WIKI/PACKAGE BODY/RNT_USERS_PKG");
    done();
  });
});

it('11i Get request for object with no collection SQL should not fail', (done) => {
  chai.request(BASE_URL)
  .get(`/api/${NON_PDB}/WIKI/SEQUENCE/RNT_USERS_SEQ`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[0].title.should.equal("Object Details");
    res.body[0].rows[0]["Object Name"].should.equal("RNT_USERS_SEQ");
    res.body[0].rows[0]["Type"].should.equal("SEQUENCE");
    res.body[0].rows[0]["Owner"].should.equal("WIKI");
    res.body[1].title.should.equal("Used By");
    res.body[1].rows.length.should.equal(1);
    res.body[1].rows[0].LINK.should.equal("WIKI/PACKAGE BODY/RNT_USERS_PKG");
    done();
  });
});

it('Invalid schema collection query', (done) => {
  const queryCollection =
      [{OWNER: "WIKI",
        type: "VIEW",
        name: "RNT_MENUS_V",
        status: "VALID",
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(400);
    done();
  });
});

it('PDB single object collection query', (done) => {
  const queryCollection =
      [{owner: "WIKI",
        type: "VIEW",
        name: "RNT_MENUS_V",
        status: "VALID",
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(3);
    res.body[2]["OBJECT_NAME"].should.equal("RNT_SYS_CHECKSUM_REC_PKG")
    done();
  });
});

it('11i single object collection query', (done) => {
  const queryCollection =
      [{owner: "WIKI",
        type: "VIEW",
        name: "RNT_MENUS_V",
        status: "VALID",
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${NON_PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(3);
    res.body[2]["OBJECT_NAME"].should.equal("RNT_SYS_CHECKSUM_REC_PKG")
    done();
  });
});

it('PDB multi object collection query', (done) => {
  const queryCollection =
      [{"owner": "WIKI",
        "type": "VIEW",
        "name": "RNT_MENUS_V",
        "status": "VALID",
        "dependencies": "Y"
      },
      {"owner": "WIKI",
        "type": "PACKAGE BODY",
        "name": "RNT_SYS_CHECKSUM_REC_PKG",
        "status": "VALID",
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(7);
    done();
  });
});

it('11i multi object collection query', (done) => {
  const queryCollection =
      [{"owner": "WIKI",
        "type": "VIEW",
        "name": "RNT_MENUS_V",
        "status": "VALID",
        "dependencies": "Y"
      },
      {"owner": "WIKI",
        "type": "PACKAGE BODY",
        "name": "RNT_SYS_CHECKSUM_REC_PKG",
        "status": "VALID",
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${NON_PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(7);
    done();
  });
});

it('PDB wildcard collection query', (done) => {
  const queryCollection =
      [{"owner": "WIKI",
        "type": "*",
        "name": "RNT_MENUS*",
        "status": "*"
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    //console.log(JSON.stringify(res.body, null, 2));
    res.body.length.should.equal(8);
    done();
  });
});

it('11i wildcard collection query', (done) => {
  const queryCollection =
      [{"owner": "WIKI",
        "type": "*",
        "name": "RNT_MENUS*",
        "status": "*"
      }];
  chai.request(BASE_URL)
  .post(`/api/collection/${NON_PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(8);
    done();
  });
});