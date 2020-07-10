import os
import json
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

def create_app(test_config=None):
    basedir = os.path.abspath(os.path.dirname(__file__))
    endpoints_file = os.path.join(basedir, 'config/endpoints.json')

    app = Flask(__name__, instance_relative_config=True)
    
    with open(endpoints_file, "r") as file:
       app.endpoints = json.loads(file.read())

    @app.errorhandler(Exception)
    def handle_error(e):
        code = 500
        if isinstance(e, HTTPException):
            code = e.code
        return jsonify(error=str(e)), code

    from . import sql2csv
    app.register_blueprint(sql2csv.bp)

    return app