# sql2csv

Generates a csv file from SQL.

## Build instructions

Review version string in setup.py then create a wheel file

```
python setup.py bdist_wheel
```

Edit the `Dockerfile` to use the correct wheel file version: 

```
COPY ./dist/sql2csv-1.0.0-py3-none-any.whl /var/www/sql2csv-1.0.0-py3-none-any.whl
```

Build and run:

```
docker build --rm -t sql2csv:latest .
docker run -d -p 8080:8080 sql2csv:latest
```
