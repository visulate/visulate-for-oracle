import os
import json
from flask import Flask, jsonify, request, current_app
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from logging.config import dictConfig
from datetime import datetime as dt


def create_app(test_config=None):
    basedir = os.path.abspath(os.path.dirname(__file__))
    endpoints_file = os.path.join(basedir, 'config/endpoints.json')


    dictConfig({
        'version': 1,
        'formatters': {'default': {
            'format': '[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
        }},
        'handlers': {'wsgi': {
            'class': 'logging.StreamHandler',
            'stream': 'ext://flask.logging.wsgi_errors_stream',
            'formatter': 'default'
        }},
        'root': {
            'level': 'INFO',
            'handlers': ['wsgi']
        }
    })

    app = Flask(__name__, instance_relative_config=True)

    origin_str = os.getenv('CORS_ORIGIN_WHITELIST')
    if origin_str is not None:
        origin_list = origin_str.split(',')
    else:
        origin_list = 'false'
    CORS(app, resources={r"/sql/*": {"origins": origin_list}})

    with open(endpoints_file, "r") as file:
       app.endpoints = json.loads(file.read())

    @app.after_request
    def after_request(response):
        """ Log every request. """
        current_app.logger.info(
            "%s [%s] %s %s %s %s %s %s %s",
            request.remote_addr,
            dt.utcnow().strftime("%d/%b/%Y:%H:%M:%S.%f")[:-3],
            request.method,
            request.path,
            request.scheme,
            response.status,
            response.content_length,
            request.referrer,
            request.user_agent,
        )
        return response

    @app.errorhandler(Exception)
    def handle_error(e):
        code = 500
        if isinstance(e, HTTPException):
            code = e.code
        return jsonify(error=str(e)), code

    from . import sql2csv
    app.register_blueprint(sql2csv.bp)

    return app