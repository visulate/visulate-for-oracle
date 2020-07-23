# sql2csv

Generates a csv file from SQL.

## Start development server

```
export FLASK_APP=sql2csv
flask run
```

## Build instructions

Review version string in setup.py then create a wheel file

```
python3 setup.py bdist_wheel
```

Edit the `Dockerfile` to use the correct wheel file version:

```
COPY ./dist/sql2csv-1.0.0-py3-none-any.whl /var/www/sql2csv-1.0.0-py3-none-any.whl
```

Generate local config file
```
mkdir ${HOME}/config/
curl localhost:3000/endpoints > ${HOME}/config/endpoints.json
```

Build and run:

```
docker build --rm -t sql2csv:latest .
docker run -d -p 8080:8080  -v ${HOME}/config:/usr/local/lib/python3.6/site-packages/sql2csv/config/ sql2csv:latest
```

Test
```
echo -n username:password| base64
dXNlcm5hbWU6cGFzc3dvcmQ=

curl --location --request POST 'localhost:8080/sql/vis13' \
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

# or using positional bind var:

curl --location --request POST 'localhost:8080/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: text/csv' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties where rownum < :r",
 "binds": [9]}'

 # or no bind variables:

 curl --location --request POST 'localhost:8080/sql/vis13' \
--header 'Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=' \
--header 'Content-Type: application/json' \
--header 'Accept: application/json' \
--data-raw '{"sql": "select prop_id, address1, city, zipcode from pr_properties"}'

```