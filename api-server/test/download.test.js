const app = require('../app');
const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');
const path = require('path');
const expect = chai.expect;

chai.use(chaiHttp);

const DOWNLOAD_ROOT = process.env.VISULATE_DOWNLOADS || path.resolve(__dirname, '../downloads');
const BASE_URL = 'http://localhost:3000';

describe('Download Service Validation', () => {
  // Use the actual example provided by the user
  const testSessionId = 'f787ff3f-d895-4b6d-b83d-2c14ec3a56bd_invalid_objects_agent_9ce924c4';
  const testFilename = 'test_file.sql';
  const testDir = path.join(DOWNLOAD_ROOT, testSessionId);
  const testFilePath = path.join(testDir, testFilename);

  before((done) => {
    // Create test environment
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'SELECT * FROM dual;');

    if (app.isStarted) {
      done();
    } else {
      app.eventEmitter.on("httpServerStarted", function () {
        done();
      });
    }
  });

  after(() => {
    // Cleanup test environment
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });

  /**
   * POSITIVE TESTS
   */
  it('Positive: should allow session ID with underscores and dashes', (done) => {
    chai.request(BASE_URL)
      .get(`/download/${testSessionId}/${testFilename}`)
      .end((err, res) => {
        expect(res).to.have.status(200);
        const content = res.text || res.body.toString();
        expect(content).to.equal('SELECT * FROM dual;');
        done();
      });
  });

  it('Positive: should allow standard UUID-format session ID', (done) => {
    const uuidSession = '32b064d4-fc62-4328-acfd-c71ca451b845';
    const uuidDir = path.join(DOWNLOAD_ROOT, uuidSession);
    const uuidFile = path.join(uuidDir, 'test.txt');
    
    if (!fs.existsSync(uuidDir)) fs.mkdirSync(uuidDir, { recursive: true });
    fs.writeFileSync(uuidFile, 'uuid content');

    chai.request(BASE_URL)
      .get(`/download/${uuidSession}/test.txt`)
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.text).to.equal('uuid content');
        
        // Cleanup
        fs.unlinkSync(uuidFile);
        fs.rmdirSync(uuidDir);
        done();
      });
  });

  /**
   * NEGATIVE TESTS (Regex / Character Validation)
   */
  it('Negative: should reject session ID with special character (!)', (done) => {
    chai.request(BASE_URL)
      .get(`/download/invalid!session/${testFilename}`)
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.text).to.equal('Invalid session ID format');
        done();
      });
  });

  it('Negative: should reject session ID with spaces', (done) => {
    chai.request(BASE_URL)
      .get(`/download/invalid%20session/${testFilename}`)
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.text).to.equal('Invalid session ID format');
        done();
      });
  });

  it('Negative: should reject illegal characters in filename (;)', (done) => {
    chai.request(BASE_URL)
      .get(`/download/${testSessionId}/illegal;name.sql`)
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.text).to.equal('Invalid filename format');
        done();
      });
  });

  it('Negative: should reject illegal characters in filename (|)', (done) => {
    chai.request(BASE_URL)
      .get(`/download/${testSessionId}/pipe|name.sql`)
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.text).to.equal('Invalid filename format');
        done();
      });
  });

  /**
   * SECURITY TESTS (Path Traversal)
   */
  it('Negative: should reject path traversal in sessionId (..)', (done) => {
    chai.request(BASE_URL)
      .get(`/download/session..id/${testFilename}`)
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.text).to.equal('Invalid session ID format');
        done();
      });
  });

  it('Negative: should reject path traversal in filename (..)', (done) => {
    chai.request(BASE_URL)
      .get(`/download/${testSessionId}/file..name.sql`)
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.text).to.equal('Invalid filename format');
        done();
      });
  });
});
