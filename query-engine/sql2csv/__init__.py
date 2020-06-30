import os
import json
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

def create_app(test_config=None):
    # create and configure the app

    basedir = os.path.abspath(os.path.dirname(__file__))
    endpoints_file = os.path.join(basedir, 'config/endpoints.json')

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY='dev',       
    )

    if test_config is None:
        # load the instance config, if it exists, when not testing
        app.config.from_pyfile('config.py', silent=True)
    else:
        # load the test config if passed in
        app.config.from_mapping(test_config)

    # ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

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