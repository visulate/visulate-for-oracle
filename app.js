const express = require('express');
const bodyparser = require("body-parser");
const app = express()
const port = 3000
const util = require('util')

app.use(bodyparser.json());
let sql = require('./src/sql_statements');

app.listen(port, () => console.log(`Visulate listening on port ${port}!`))

const NodeCache = require( "node-cache" );
const connectionCache = new NodeCache();

// Use JSON schema to validate POST and PUT requests
var { Validator, ValidationError } = require('express-json-validator-middleware');
var validator = new Validator({allErrors: true});
var validate = validator.validate;

const ConnectionSchema = {
  "type": "object",
  "required": ['user', 'password', 'connectString'],
  "properties": {
    "user": {"type": "string"},
    "password":  {"type": "string"},
    "connectString":  {"type": "string"}
  }
}

const oracledb = require('oracledb')
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

function setConnection(oradb, connection) {
  let returnValue;
  connectionCache.set(oradb, connection, (err, success) => {
    if (!err && success) {
      returnValue = 'valid';
    } else {
      console.log(util.inspect(err, {showHidden: false, depth: null}));
      returnValue = err
    }

  });
  return (returnValue);
}

async function establishConnection(res, oradb, connection) {
  const existingConnection = connectionCache.get(oradb);
  if (existingConnection) {
    return res.status(409).send('invalid');
  }
  let conn;
  let result;
  try {
    conn = await oracledb.getConnection(connection);
    result = await conn.execute(sql['COUNT_DBA_OBJECTS'].sql);
  } catch (err) {
    res.status(401).send(err.message);
  } finally {
    if (conn) {
      const connectStatus =  setConnection(oradb, connection);
      await conn.close()
      connectStatus === 'valid'?
              res.status(201).send(JSON.stringify(result.rows)) :
              res.status(500).send(util.inspect(connectStatus, {showHidden: false, depth: null}));
    }
  }
}

async function listObjects(res, oradb, owner, type, name, status ) {
  const connection = connectionCache.get(oradb);
  let conn;
  let result;
  let query = sql['LIST_DBA_OBJECTS'];
  query.params.owner.val = owner;
  query.params.type.val = type;
  query.params.name.val = '%';
  query.params.status.val = '%';

  try {
    conn = await oracledb.getConnection(connection);

    result = await conn.execute(query.sql, query.params);
  } catch (err) {
    res.status(401).send(err.message);
  } finally {
    if (conn) {
      await conn.close()
      res.status(200).send(JSON.stringify(result.rows));
    }
  }
}



// *********************************************************
// REST API HTTP routes
// *********************************************************

app.post('/oradb/:db', validate({body: ConnectionSchema}), (req, res) => {
  const connect = req.body;
  establishConnection(res, req.params.db, connect);
});

app.get('/oradb/:db/:owner/:type/:name/:status', (req, res) => {
  listObjects(res, req.params.db, req.params.owner, req.params.type,
                   req.params.name, req.params.status );
});



// *********************************************************
// Error handler JSON Schema errors
// *********************************************************
app.use(function(err, req, res, next) {
    if (err instanceof ValidationError) {
        console.error(req.body);
        console.error(util.inspect(err.validationErrors, {showHidden: false, depth: null}));
        res.status(400).send('invalid');
        next();
    }
    else next(err); // pass error on if not a validation error
});
