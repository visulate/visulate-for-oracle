//TODO add negative tests + json schema validation for response bodies

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
    console.log(res.body);
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
    console.log(res.body);
    done();
  });
});

it('Filtered GET PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/PR_*/*')
  .end((err, res) => {
    expect(res).to.have.status(200);
    console.log(res.body);
    done();
  });
});

it('Filtered GET invalid PACKAGE BODY should a filtered return list', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/*/invalid')
  .end((err, res) => {
    expect(res).to.have.status(200);
    console.log(res.body);
    done();
  });
});

/**
 * Show Object
 */
it('Show package body', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/PACKAGE BODY/PR_GEO_UTILS_PKG')
  .end((err, res) => {
    expect(res).to.have.status(200);
    console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});

it('Show Table', (done) => {
  chai.request(BASE_URL)
  .get('/vis19pdb/RNTMGR2/TABLE/PR_PROPERTIES')
  .end((err, res) => {
    expect(res).to.have.status(200);
    console.log(JSON.stringify(res.body, null, 2));
    done();
  });
});