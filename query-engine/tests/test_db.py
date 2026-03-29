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

app = create_app({'TESTING': True})
client = app.test_client()

print("Endpoint:", validEndpoint)
response = client.post(f"/sql/{validEndpoint}",
 headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/json"},
 json={"sql": "select banner from v$version"})
print("Status:", response.status_code)
print("Data:", response.data)
