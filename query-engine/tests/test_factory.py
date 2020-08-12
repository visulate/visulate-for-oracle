from sql2csv import create_app
import os
import json
from base64 import b64encode

basedir = os.path.abspath(os.path.dirname(__file__))
conf_file = os.path.join(basedir, 'conftest.json')
with open(conf_file, "r") as file:
    config = json.loads(file.read())

validEndpoint = config.get('validEndpoint')
validCredentials = config.get('validCredentials')
validConnectString =  config.get('validConnectString')
credentials = b64encode(validCredentials.encode('utf-8')).decode('utf-8')

def test_get_valid_endpoint(client):
    response = client.get(f"/sql/{validEndpoint}")
    assert response.data == validConnectString.encode('utf-8')
    assert response.status_code == 200

def test_get_invalid_endpoint(client):
    response = client.get('/sql/invalid')
    assert response.status_code == 200
    assert response.data == b''

def test_simple_query(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
     json={"sql": "select banner from v$version"})
    assert response.status_code == 200
    assert response.data == b'"Oracle Database 18c Express Edition Release 18.0.0.0.0 - Production"\n'

def test_csv_header_line(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
     json={"sql": "select banner from v$version", "options": {"download_lobs": "N", "csv_header": "y"}})
    assert response.status_code == 200
    assert response.data == b'"BANNER"\n"Oracle Database 18c Express Edition Release 18.0.0.0.0 - Production"\n'

def test_simple_json_query(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={
         "Authorization": f"Basic {credentials}",
         "Content-Type": "application/json",
         "Accept": "application/json"
         },
     json={"sql": "select banner from v$version"})

    expectedResponse = '"{\\"columns\\":[\\"BANNER\\"], \\n\\"rows\\": [\\n{\\"BANNER\\": \\"Oracle Database 18c Express Edition Release 18.0.0.0.0 - Production\\"}\\n]}"'
    assert response.status_code == 200
    assert json.dumps(response.data.decode("utf-8") ) == expectedResponse

def test_invalid_sql(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}"},
     json={"sql": "select banner from version"})
    assert response.status_code == 400
    assert response.data == b'{"error":"400 Bad Request: ORA-00942: table or view does not exist"}\n'

def test_named_parameter(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}"},
     json={"sql": "select count(*) from dba_objects where object_name=:obj", "binds": {"obj":"DBA_OBJECTS"}})
    assert response.status_code == 200
    assert response.data == b'2\n'

def test_positional_parameters(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}"},
     json={"sql": "select count(*) from dba_objects where object_name=:obj and object_type=:type", "binds": ["DBA_OBJECTS", "VIEW"]})
    assert response.status_code == 200
    assert response.data == b'1\n'

def test_unbound_varable(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}"},
     json={"sql": "select count(*) from dba_objects where object_name=:obj and object_type=:type", "binds": ["DBA_OBJECTS"]})
    assert response.status_code == 400
    assert response.data == b'{"error":"400 Bad Request: ORA-01008: not all variables bound"}\n'

def test_select_only(client):
    response = client.post(f"/sql/{validEndpoint}",
    headers={"Authorization": f"Basic {credentials}"},
    json={"sql": "delete from mytable"})
    assert response.status_code == 403
    assert response.data == b'{"error":"403 Forbidden: SQL statement is not of type SELECT"}\n'

def test_invalid_binds_structure(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}"},
     json={"sql": "select count(*) from dba_objects where object_name=:obj and object_type=:type", "binds": ["DBA_OBJECTS", {"obj":"DBA_OBJECTS"}]})

    assert response.status_code == 400
    assert "Bind variables must be a simple array" in response.data.decode("utf-8")

def test_invalid_options(client):
    response = client.post(f"/sql/{validEndpoint}",
     headers={"Authorization": f"Basic {credentials}"},
     json={"sql": "select count(*) from dba_objects where object_name=:obj and object_type=:type", "binds": ["DBA_OBJECTS"], "options": ["invalid"]})
    assert response.status_code == 400

def test_default_cors_false(client):
    response = client.get(f"/sql/{validEndpoint}")
    assert response.data == validConnectString.encode('utf-8')
    assert response.status_code == 200
    assert response.access_control_allow_origin == 'false'

def test_healthz(client):
    response = client.get(f"/healthz")
    assert response.data == b'healthy'
    assert response.status_code == 200

def test_healthz_slash(client):
    response = client.get(f"/")
    assert response.data == b'healthy'
    assert response.status_code == 200