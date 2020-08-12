# sql2csv

Generates a csv file from SQL.

## Start development server

```
export FLASK_APP=sql2csv
flask run
```

## Test Suite

Tests are located in `query-engine/tests` directory and require a `sql2csv/config/endpoints.json` file:
```
{"oracle18XE":"db205.visulate.net:41521/XEPDB1"}
```
and a matching `tests/config.json` file:
```
{
    "validEndpoint": "oracle18XE",
    "validCredentials": "visulate:visPassword",
    "validConnectString": "db205.visulate.net:41521/XEPDB1"
}
```
Execute the tests by running `pytest` from the `query-engine` directory or via Test interface in VS Code

## Build instructions

Generate local config file
```
mkdir ${HOME}/config/
curl localhost:3000/endpoints > ${HOME}/config/endpoints.json
```

Build and run:

```
docker build --rm -t sql2csv:latest .
docker run -d -p 5000:5000 -v ${HOME}/config:/query-engine/sql2csv/config/ sql2csv:latest
```

# Manual Testing
```
echo -n username:password| base64
dXNlcm5hbWU6cGFzc3dvcmQ=

curl --location --request POST 'localhost:5000/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: text/csv' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties where rownum < :r",
 "binds": {"r":9}}'

76374,"819 OLIVE AVE","TITUSVILLE","32780"
76376,"1175 THIRD AVE","TITUSVILLE","32780"
76378,"1165 THIRD AVE","TITUSVILLE","32780"
76379,"1180 THIRD AVE","TITUSVILLE","32780"
76380,"805 WARREN CT W","TITUSVILLE","32780"
76384,"4434 EVER PL","ORLANDO","32811"
76385,"810 WARREN CT W","TITUSVILLE","32780"
76386,"810 WARREN ST W","TITUSVILLE","32780"

## or using positional bind var:

curl --location --request POST 'localhost:5000/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: text/csv' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties where rownum < :r",
 "binds": [9]}'

## or no bind variables:

 curl --location --request POST 'localhost:5000/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: application/json' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties"}'

```
