const app = require('../app');
let chai = require('chai'), chaiHttp = require('chai-http');
let should = chai.should();
let expect = chai.expect;
chai.use(chaiHttp);

const NON_PDB =  process.env.VISULATE_NON_PDB || 'vis13';
const PDB =  process.env.VISULATE_PDB ||'vis19pdb';

const BASE_URL = 'http://localhost:3000/api';

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
    done();
  });
});

it('GET invalid endpoint should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/xxInvalidxx/WIKI/TABLE/*/*')
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Requested database was not found');
    done();
  });
});

it('GET 19c invalid schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/xxInvalidSchema/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('No objects match the owner + object_type combination');
    done();
  });
});

it('GET 11i invalid schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/xxInvalidSchema/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('No objects match the owner + object_type combination');
    done();
  });
});

/**
 * Database Report 
 */
it('GET 19c Database summary', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});


/**
 * Find Objects
 */
it('GET 19c TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/TABLE/*/*`)
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
  .get(`/${NON_PDB}/WIKI/TABLE/*/*`)
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

it('Filtered 19c GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/RNT_MENU*/*`)
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
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/RNT_MENU*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(5);
    res.body[0].should.equal("RNT_MENUS_PKG");
    res.body[4].should.equal("RNT_MENU_TABS_PKG");
    done();
  });
});

it('GET 19c invalid object_name should return an empty list', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/xxInvalidObjectName/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(0);   
    done();
  });
});

it('GET 11i invalid object_name should return an empty list', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/xxInvalidObjectName/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(0);   
    done();
  });
});


it('Filtered 19c GET list of invalid package bodies should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/*/invalid`)
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
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/*/invalid`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(1);
    res.body[0].should.equal("RNT_USERS_PKG");
    done();
  });
});

/**
 * Show Object
 */
it('19c SQL injection attempt should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/' + PDB + "/WIKI/TABLE/ OR 1=1;")
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Database object was not found');
    done();
  });
});

it('11i SQL injection attempt should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/' + NON_PDB + "/WIKI/TABLE/ OR 1=1;")
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Database object was not found');
    done();
  });
});

it('19c Show package body', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/RNT_MENUS_PKG`)
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
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/RNT_MENUS_PKG`)
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

it('19c Invalid package body should show errors', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/RNT_USERS_PKG`)
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
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/RNT_USERS_PKG`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body[1].title.should.equal("Error Details");
    res.body[1].rows[0]["Line"].should.equal(61);
    done();
  });
});

it('19c Show Table', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/TABLE/RNT_MENUS`)
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
  .get(`/${NON_PDB}/WIKI/TABLE/RNT_MENUS`)
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

it('19c VIEW object should have USES dependencies', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/VIEW/RNT_MENUS_V`)
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
  .get(`/${NON_PDB}/WIKI/VIEW/RNT_MENUS_V`)
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

it('19c Get request for object with no collection SQL should not fail', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/SEQUENCE/RNT_USERS_SEQ`)
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
  .get(`/${NON_PDB}/WIKI/SEQUENCE/RNT_USERS_SEQ`)
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
  .post(`/collection/${PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(400);
    done();
  });
});

it('19c single object collection query', (done) => {
  const queryCollection = 
      [{owner: "WIKI",
        type: "VIEW", 
        name: "RNT_MENUS_V",
        status: "VALID",
      }];
  chai.request(BASE_URL)
  .post(`/collection/${PDB}/`)
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
  .post(`/collection/${NON_PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(3);
    res.body[2]["OBJECT_NAME"].should.equal("RNT_SYS_CHECKSUM_REC_PKG")
    done();
  });
});

it('19c multi object collection query', (done) => {
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
  .post(`/collection/${PDB}/`)
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
  .post(`/collection/${NON_PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.should.be.a('array');
    res.body.length.should.equal(7);
    done();
  });
});

it('19c wildcard collection query', (done) => {
  const queryCollection = 
      [{"owner": "WIKI",
        "type": "*", 
        "name": "RNT_MENUS*",
        "status": "*"
      }];
  chai.request(BASE_URL)
  .post(`/collection/${PDB}/`)
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
  .post(`/collection/${NON_PDB}/`)
  .send(queryCollection)
  .end((err, res) => {
    expect(res).to.have.status(200);
    res.body.length.should.equal(8);
    done();
  });
});