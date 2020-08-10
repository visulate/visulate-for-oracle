import csv
import sys
import io
import simplejson as json
import cx_Oracle
import sqlparse
import base64
import logging

from flask import (
    Blueprint, Response, request, abort, current_app, make_response
)

bp = Blueprint('sql2csv', __name__, url_prefix='/')

def fail_request(code, description):
    current_app.logger.error(description)
    abort(code, description=description)

class Line(object):
    def __init__(self):
        self._line = None
    def write(self, line):
        self._line = line
    def read(self):
        return self._line

def format_bytes(num):
    """Convert bytes to KB, MB, GB or TB"""
    step_unit = 1024

    for x in ['bytes', 'KB', 'MB', 'GB', 'TB']:
        if num < step_unit:
            return "%3.1f %s" % (num, x)
        num /= step_unit

def get_option(option, default):
    """Return an option from the query options dictionary"""
    query = request.json
    options = query.get('options')
    if options is not None:
        return options.get(option, default)
    else:
        return default

def print_lob_size(value):
    """Return the LOB size instead of the LOB itself for display in UI"""
    lobsize = sys.getsizeof(value)
    lobsizeStr = format_bytes(lobsize)
    return f'LOB (size: {lobsizeStr})'

def download_clob(value):
    """Download CLOB if less that 1 GB"""
    lobsize = sys.getsizeof(value)
    if lobsize < 1073741824:
        return value
    else:
        fail_request(400, description="LOB download size exceeds 1 GB")

def download_blob(value):
    """Encode BLOB using base64 encoding and download if less that 1 GB"""
    lobsize = sys.getsizeof(value)
    if lobsize < 1073741824:
        return base64.b64encode(value)
    else:
        fail_request(400, description="LOB download size exceeds 1 GB")

def expand_object(obj, expanded_object, prefix = ""):
    """Expand the contents of and Oracle Object"""
    if obj.type.iscollection:
        print(prefix, "[", file=expanded_object)
        for value in obj.aslist():
            if isinstance(value, cx_Oracle.Object):
                expand_object(value, expanded_object , prefix + "  ")
            else:
                print(prefix + "  ", repr(value), file=expanded_object)
        print(prefix, "]", file=expanded_object)
    else:
        print(prefix, "{", file=expanded_object)
        for attr in obj.type.attributes:
            value = getattr(obj, attr.name)
            if isinstance(value, cx_Oracle.Object):
                print(prefix + "   " + attr.name + ":", file=expanded_object)
                expand_object(value, expanded_object , prefix + "  ")
            else:
                print(prefix + "   " + attr.name + ":", repr(value), file=expanded_object)
        print(prefix, "}", file=expanded_object)

def object_out_converter(obj):
    expanded_object = io.StringIO()
    expand_object(obj, expanded_object, "")
    return expanded_object.getvalue()

def output_type_handler(cursor, name, default_type, size, precision, scale):
    """Modify the fetched data types for LOB and OBJECT columns"""
    download_lobs = get_option("download_lobs", "N")

    if default_type == cx_Oracle.CLOB and download_lobs.upper() == 'Y':
        return cursor.var(cx_Oracle.DB_TYPE_LONG, arraysize=cursor.arraysize, outconverter=download_clob)
    if default_type == cx_Oracle.BLOB and download_lobs.upper() == 'Y':
        return cursor.var(cx_Oracle.DB_TYPE_LONG_RAW, arraysize=cursor.arraysize, outconverter=download_blob)

    if default_type == cx_Oracle.CLOB and download_lobs.upper() != 'Y':
        return cursor.var(cx_Oracle.LONG_STRING, arraysize=cursor.arraysize, outconverter=print_lob_size)
    if default_type == cx_Oracle.BLOB and download_lobs.upper() != 'Y':
        return cursor.var(cx_Oracle.LONG_BINARY, arraysize=cursor.arraysize, outconverter=print_lob_size)

    object_typename = get_option("cx_oracle_object", None)
    if default_type == cx_Oracle.OBJECT and object_typename is not None:
        return cursor.var(default_type, arraysize=cursor.arraysize, outconverter=object_out_converter, typename=object_typename)


def iter_csv(data):
    """pipe_results helper function"""
    line = Line()
    writer = csv.writer(line)
    for csv_line in data:
        writer.writerow(csv_line)
        yield line.read()

def pipe_results(connection, cursor):
    """Loop through a SQL statement's result set and return as CSV"""
    if cursor is None:
        connection.close()
        return "Statement processed"
    line = Line()
    writer = csv.writer(line, delimiter=',', lineterminator="\n", quoting=csv.QUOTE_NONNUMERIC)
    try:
        for row in cursor:
            writer.writerow(row)
            yield line.read()
        cursor.close()
        connection.close()
    except cx_Oracle.DatabaseError as e:
        errorObj, = e.args
        fail_request(400, description=errorObj.message)

def pipe_results_as_json(connection, cursor):
    """Loop through a SQL statement's result set and return as a JSON object"""
    if cursor is None:
        connection.close()
        return Response('{"message": "Statement processed"}', mimetype='application/json')
    def generate():
        columns = [col[0] for col in cursor.description]
        cursor.rowfactory = lambda *args: dict(zip(columns, args))
        yield('{')
        yield(f'"columns":{json.dumps(columns)}, \n')
        yield('"rows": ')
        yield('[')
        try:
            firstRow = True
            for row in cursor:
                if firstRow:
                    firstRow = False
                    yield('\n')
                else:
                    yield (',\n')
                yield(json.dumps(row, default=str))
            cursor.close()
            connection.close()
            yield('\n]}')
        except cx_Oracle.DatabaseError as e:
            errorObj, = e.args
            fail_request(400, description=errorObj.message)
    return Response(generate(), mimetype='application/json')

def get_connection(username, password, connectString):
    """Get an Oracle database connection"""
    try:
        connection = cx_Oracle.connect(username, password, connectString)
        connection.outputtypehandler = output_type_handler
    except cx_Oracle.DatabaseError as e:
        errorObj, = e.args
        fail_request(401, description=errorObj.message)
    else:
        return connection

def get_cursor(connection, sql, binds):
    """Create a cursor and execute a SQL statement"""
    try:
        cursor = connection.cursor()
        cursor.execute("set transaction read only")
        if binds == None:
            return cursor.execute(sql)
        else:
            return cursor.execute(sql, binds)
    except cx_Oracle.DatabaseError as e:
        errorObj, = e.args
        fail_request(400, description=errorObj.message)

def get_connect_string(endpoint):
    """Get the connect string for a registered endpoint"""
    connectString = current_app.endpoints.get(endpoint)
    if connectString == None:
        return ''

    return connectString

def validate_binds(binds):
    """Verify bind varables are a list or dict of database chars or numbers"""
    if isinstance(binds, list) and all(isinstance(item, (str, int, float)) for item in binds):
        return binds
    elif isinstance(binds, dict) and all(isinstance(item, (str, int, float)) for item in binds.values()):
        return binds
    elif binds is None:
        return []
    else:
        fail_request(400, description=\
            "Bind variables must be a simple array e.g. [280, \"Accounts\"]\
                 or object { \"dept_id\": 280, \"dept_name\": \"Accounts\"}")

def validate_options(options):
    if isinstance(options, dict):
        pass
    elif options is None:
        pass
    else:
        fail_request(400, description="Invalid query options")


@bp.route('/', methods=['GET'])
@bp.route('/healthz', methods=['GET'])
def healthz():
    response = make_response('healthy', 200)
    response.mimetype="text/plain"
    return response

@bp.route('/sql/<endpoint>', methods=['POST', 'GET'])
def sql2csv(endpoint):
    """Generate a CSV file or JSON object from a SQL statement

    POST a SQL statement + optional bind variables to a registered endpoint
    passing the database username and password as basic auth credentials.
    Returns a CSV stream or JSON object based on the value passed to the
    http Accept header.

    GET the connect string for a registered endpoint. Used by the UI to
    control access to the query functionality.
    """

    if request.method == 'POST':
        query = request.json
        user = request.authorization.username
        passwd = request.authorization.password
        connStr = get_connect_string(endpoint)
        httpHeaders = request.headers

        sql = query.get('sql')
        current_app.logger.info(f"POST {user} @ {endpoint}: {sql}")
        statements = list(sqlparse.parse(sql))

        for statement in statements:
            if statement.get_type() != 'SELECT':
                fail_request(403, description='SQL statement is not of type SELECT')

        binds = query.get('binds')
        vbinds = validate_binds(binds)

        options = query.get('options')
        validate_options(options)

        connection = get_connection(user, passwd, connStr)
        cursor = get_cursor(connection, sql, vbinds)

        if httpHeaders.get('accept') == 'application/json':
            response = pipe_results_as_json(connection, cursor)
        else:
            response = Response(pipe_results(connection, cursor),
                                mimetype='text/csv')

        return response

    # return connect string or empty string for GET request
    response = make_response(get_connect_string(endpoint), 200)
    response.mimetype="text/plain"
    return response
