//TODO add json schema validation for response bodies

const app = require('../app');
let chai = require('chai'), chaiHttp = require('chai-http');
let should = chai.should();
let expect = chai.expect;
chai.use(chaiHttp);

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
  .get('/xxInvalidxx/RNTMGR2/TABLE/*/*')
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Requested database was not found');
    done();
  });
});

it('GET invalid schema should return 404', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/xxInvalidSchema/TABLE/*/*')
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('No objects match the owner + object_type combination');
    done();
  });
});

/**
 * Find Objects
 */
it('GET TABLES should return list of tables', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/TABLE/*/*')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('Filtered GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/PR_*/*')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('GET invalid object_name should return an empty list', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/xxInvalidObjectName/*')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});


it('Filtered GET list of invalid package bodies should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/*/invalid')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

/**
 * Show Object
 */
it('SQL injection attempt should return 404', (done) => {
  chai.request(BASE_URL)
  .get("/vis19pdb/RNTMGR2/TABLE/' OR 1=1;")
  .end((err, res) => {
    expect(res).to.have.status(404);
    res.text.should.eql('Database object was not found');
    done();
  });
});

it('Show package body', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/PR_GEO_UTILS_PKG')
  .end((err, res) => {
    expect(res).to.have.status(200);
   // console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('Show Table', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/TABLE/PR_PROPERTIES')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});

it('Get request for object with no collection SQL should not fail', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/SEQUENCE/PR_PROPERTIES_SEQ')
  .end((err, res) => {
    expect(res).to.have.status(200);
    done();
  });
});