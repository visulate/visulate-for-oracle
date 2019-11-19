//TODO add json schema validation for response bodies

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
 * Find Objects
 */
it('GET 19c TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('GET 11i TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/TABLE/*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('Filtered 19c GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/RNT_*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('Filtered 11i GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/RNT_*/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('GET 19c invalid object_name should return an empty list', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/xxInvalidObjectName/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('GET 11i invalid object_name should return an empty list', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/xxInvalidObjectName/*`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});


it('Filtered 19c GET list of invalid package bodies should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/PACKAGE BODY/*/invalid`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('Filtered 11i GET list of invalid package bodies should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/*/invalid`)
  .end((err, res) => {
    expect(res).to.have.status(200);
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
   // console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('11i Show package body', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/PACKAGE BODY/RNT_MENUS_PKG`)
  .end((err, res) => {
    expect(res).to.have.status(200);
   // console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('19c Show Table', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/TABLE/RNT_MENUS`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('11i Show Table', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/TABLE/RNT_MENUS`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('19c Get request for object with no collection SQL should not fail', (done) => {
  chai.request(BASE_URL)
  .get(`/${PDB}/WIKI/SEQUENCE/RNT_USERS_SEQ`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('11i Get request for object with no collection SQL should not fail', (done) => {
  chai.request(BASE_URL)
  .get(`/${NON_PDB}/WIKI/SEQUENCE/RNT_USERS_SEQ`)
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});