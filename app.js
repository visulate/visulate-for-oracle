const express = require('express')
const app = express()
const port = 3000
app.listen(port, () => console.log(`Visulate listening on port ${port}!`))

const oracledb = require('oracledb')
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const config = {
  user: 'visulate',
  password: 'visulate',
  connectString: 'localhost:1521/ORCLPDB1'
}

async function getUserList() {
  let conn

  try {
    conn = await oracledb.getConnection(config)

    const result = await conn.execute('select username from dba_users order by username');
    return(JSON.stringify(result.rows));
  } catch (err) {
    console.log('Ouch!', err)
  } finally {
    if (conn) { // conn assignment worked, need to close
      await conn.close()
    }
  }
}

async function getUser (username) {
  let conn

  try {
    conn = await oracledb.getConnection(config)

    const result = await conn.execute(
      'select object_type, count(*) object_count ' +
       'from dba_objects where owner = :id ' +
       'group by object_type order by 1, 2',
      [username]
    )

    return(JSON.stringify(result.rows))
  } catch (err) {
    console.log('Ouch!', err);
  } finally {
    if (conn) { // conn assignment worked, need to close
      await conn.close();
    }
  }
}

app.get('/user', async (req, res) => {
  const userlist = await getUserList();
  res.status(200).send(userlist);
});


app.get('/user/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  res.status(200).send(user);
});
