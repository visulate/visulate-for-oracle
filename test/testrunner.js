
// **************************************************************
// End to End CRUD test for REST APIs.
// Note: the tests run in sequence and the failure of an early test may
// impact the result of laters ones.
// **************************************************************

var expect  = require('chai').expect;
var request = require('request');
var app = require('../app')

const CONNECT_STRING = "10.0.0.30:1521/ORCLPDB1";

const HEADERS = {
    "content-type": "application/json",
};
const BASE_URL = 'http://localhost:3000/oradb/';

it('POST invalid schema should fail with 400 status', (done) => {
  //var requestBody = {"user": "visulate", "password": "visulate", "connectString": "localhost:1521/ORCLPDB1"};
  var requestBody = {"user": "visulate", "password": "visulate"};
  console.log('Review Error message:');
  request(
    {
      method: 'post',
      url: BASE_URL + 'invalid',
      body: requestBody,
      headers: HEADERS,
      json: true
    }, (error, response, body) => {
      expect(response.statusCode).to.equal(400);
      done();
    }
  );
});

it('POST to oradb with invalid credentails should fail', (done) => {
  var requestBody = {"user": "visulate", "password": "InvalidPassword", "connectString": CONNECT_STRING};
  request(
    {
      method: 'post',
      url: BASE_URL + 'local',
      body: requestBody,
      headers: HEADERS,
      json: true
    }, (error, response, body) => {
      expect(response.statusCode).to.equal(401);
      console.log(body);
      done();
    }
  );
});

it('POST to oradb should create new connection', (done) => {
  var requestBody = {"user": "visulate", "password": "visulate", "connectString": CONNECT_STRING};
  request(
    {
      method: 'post',
      url: BASE_URL + 'local',
      body: requestBody,
      headers: HEADERS,
      json: true
    }, (error, response, body) => {
      expect(response.statusCode).to.equal(201);
      console.log(body);
      done();
    }
  );
});

it('GET list of tables', (done) => {
  request(
    {
      method: 'get',
      url: BASE_URL + 'local/RNTMGR2/TABLE/*/*',
    }, (error, response, body) => {
      expect(response.statusCode).to.equal(200);
      console.log(body);
      done();
    }
  );
});
