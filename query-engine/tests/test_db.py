import json
import os
from base64 import b64encode

basedir = os.path.abspath(os.path.dirname(__file__))
conf_file = os.path.join(basedir, 'conftest.json')
with open(conf_file, "r") as file:
    config = json.loads(file.read())

validEndpoint = config.get('validEndpoint')
validCredentials = config.get('validCredentials')
credentials = b64encode(validCredentials.encode('utf-8')).decode('utf-8')

def test_banner_query(client):
    response = client.post(
        f"/sql/{validEndpoint}",
        headers={
            "X-DB-Credentials": f"{credentials}",
            "Content-Type": "application/json"
        },
        json={"sql": "select banner from v$version"}
    )
    assert response.status_code == 200
    data = response.data.decode('utf-8').strip().strip('"')
    assert data.startswith('Oracle')
    assert data.endswith('- Production')
