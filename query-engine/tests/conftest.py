import os
import pytest
from sql2csv import create_app

@pytest.fixture
def app():
    os.environ['ENDPOINTS_FILE'] = os.path.join(os.path.dirname(__file__), 'conftest.json')
    app = create_app({
        'TESTING': True
    })
    yield app

@pytest.fixture
def client(app):
    return app.test_client()