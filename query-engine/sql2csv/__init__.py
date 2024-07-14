import os
import json
import logging
from flask import Flask, jsonify, request, current_app
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from logging.config import dictConfig
from flask.logging import default_handler
from datetime import datetime as dt

class _ExcludeErrorsFilter(logging.Filter):
    def filter(self, record):
        """Filters out log messages with log level ERROR (numeric value: 40) or higher."""
        return record.levelno < 40

def create_app(test_config=None):
    basedir = os.path.abspath(os.path.dirname(__file__))
    endpoints_file = os.path.join(basedir, 'config/endpoints.json')

    dictConfig({
        'version': 1,
        'filters': {
            'exclude_errors': {
                '()': _ExcludeErrorsFilter
            }
        },
        'formatters': {'default': {
            'format': '%(levelname)s in %(module)s: %(message)s',
        }},
        'handlers': {
            'wsgi-stderr': {
                'class': 'logging.StreamHandler',
                'level': 'ERROR',
                'stream': 'ext://flask.logging.wsgi_errors_stream',
                'formatter': 'default'
            },
            'wsgi-stdout': {
                'class': 'logging.StreamHandler',
                'level': 'DEBUG',
                'stream': 'ext://sys.stdout',
                'formatter': 'default',
                'filters': ['exclude_errors']
            }
        },
        'root': {
            'level': 'NOTSET',
            'handlers': ['wsgi-stderr', 'wsgi-stdout']
        }
    })

    app = Flask(__name__, instance_relative_config=True)
    app.logger.removeHandler(default_handler)

    origin_str = os.getenv('CORS_ORIGIN_WHITELIST')
    if origin_str is not None:
        origin_list = origin_str.split(',')
    else:
        origin_list = 'false'
    CORS(app, resources={r"/sql/*": {"origins": origin_list}})
    app.logger.log(10, f"CORS enabled with origins: {origin_list}")
    print(f"CORS enabled with origins: {origin_list}")


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