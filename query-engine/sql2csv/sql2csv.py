import csv
import sys
import simplejson as json
import oracledb
import psycopg2
import psycopg2.extras
import sqlparse
import base64
import time
import datetime
import os

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

def dump_oracle_object_to_dict(obj):
    """Recursively converts an oracledb.Object into a dictionary or list."""
    if not isinstance(obj, oracledb.Object):
        return obj

    if obj.type.iscollection:
        result = []
        if hasattr(obj, 'aslist'):
            for value in obj.aslist():
                result.append(dump_oracle_object_to_dict(value))
        return result
    else:
        result = {}
        for attr in obj.type.attributes:
            try:
                value = getattr(obj, attr.name)
                result[attr.name] = dump_oracle_object_to_dict(value)
            except AttributeError:
                result[attr.name] = f"Error: Attribute '{attr.name}' not found/accessible"
        return result

def convert_db_value(value, download_lobs_flag):
    """Converts a database value to a Python-friendly format."""
    if isinstance(value, oracledb.LOB):
        if download_lobs_flag.upper() == 'Y':
            try:
                lob_data = value.read()
                if value.type == oracledb.DB_TYPE_BLOB:
                    return base64.b64encode(lob_data).decode('utf-8')
                return lob_data
            except Exception as e:
                return f"ERROR_LOB_DOWNLOAD: {str(e)}"
        else:
            lobsize = sys.getsizeof(value)
            return f'LOB (size: {format_bytes(lobsize)})'
    elif isinstance(value, bytes):
        return value.decode('utf-8', errors='replace')
    elif isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    elif isinstance(value, oracledb.Object):
        return dump_oracle_object_to_dict(value)
    else:
        return value

def output_type_handler(cursor, name, default_type, size, precision, scale):
    """Modify the fetched data types for LOB and OBJECT columns (Oracle only)."""
    if default_type == oracledb.DB_TYPE_CLOB:
        return cursor.var(oracledb.DB_TYPE_LONG_STR, arraysize=cursor.arraysize)
    if default_type == oracledb.DB_TYPE_BLOB:
        return cursor.var(oracledb.DB_TYPE_LONG_RAW, arraysize=cursor.arraysize)
    return None

def pipe_results_as_csv(connection, cursor, start_time, download_lobs):
    """Loop through a SQL statement's result set and return as a CSV stream"""
    if cursor is None:
        connection.close()
        return Response('Statement processed', mimetype='text/csv')

    csv_header = get_option('csv_header', 'n').lower()

    def generate(download_lobs_arg):
        line = Line()
        writer = csv.writer(line, lineterminator='\n', quoting=csv.QUOTE_NONNUMERIC)
        
        is_postgres = hasattr(connection, 'cursor_factory')
        if is_postgres:
            columns = [desc[0] for desc in cursor.description]
        else:
            columns = [col[0] for col in cursor.description]

        if csv_header == 'y':
            writer.writerow(columns)
            yield line.read()

        try:
            for row in cursor:
                # If row is a dict (Postgres with RealDictCursor), convert to list
                if isinstance(row, dict):
                    row_values = [convert_db_value(row[col], download_lobs_arg) for col in columns]
                else:
                    row_values = [convert_db_value(val, download_lobs_arg) for val in row]
                
                writer.writerow(row_values)
                yield line.read()
            
            connection.close()
        except Exception as e:
            current_app.logger.error(f"Error during CSV streaming: {str(e)}")
            yield f"ERROR: {str(e)}"

    return Response(generate(download_lobs), mimetype='text/csv')

def pipe_results_as_json(connection, cursor, start_time, download_lobs):
    """Loop through a SQL statement's result set and return as a JSON object"""
    if cursor is None:
        connection.close()
        return Response('{"message": "Statement processed"}', mimetype='application/json')

    is_postgres = hasattr(connection, 'cursor_factory')

    def generate(download_lobs_arg):
        if is_postgres:
            columns = [desc[0] for desc in cursor.description]
        else:
            columns = [col[0] for col in cursor.description]

        yield('{\n')
        yield(f'"columns":{json.dumps(columns)}, \n')
        yield('"rows": [\n')
        try:
            firstRow = True
            for row in cursor:
                if firstRow:
                    firstRow = False
                else:
                    yield (',\n')

                row_dict = {}
                if is_postgres:
                    # row is already a dict-like object if using RealDictCursor
                    for k, v in row.items():
                        row_dict[k] = convert_db_value(v, download_lobs_arg)
                else:
                    for i, col_value in enumerate(row):
                        col_name = columns[i]
                        row_dict[col_name] = convert_db_value(col_value, download_lobs_arg)

                yield(json.dumps(row_dict, default=str))

            cursor.close()
            connection.close()
            yield('\n],')
            yield(f'"executionTime":{json.dumps(time.time() - start_time)} \n')
            yield('}')
        except Exception as e:
            current_app.logger.error(f"Error during JSON streaming: {str(e)}")
            yield(f'{{"error": "Internal Server Error: {str(e)}"}}')

    return Response(generate(download_lobs), mimetype='application/json')

def get_connection(username, password, params):
    """Get a database connection (Oracle or Postgres)"""
    db_type = params.get("dbType", "oracle")
    try:
        if db_type == "postgres":
            dsn = params.get("dsn")
            if '/' in dsn and ':' in dsn and ' ' not in dsn and '=' not in dsn:
                host_port, dbname = dsn.split('/')
                host, port = host_port.split(':')
                connection = psycopg2.connect(
                    user=username,
                    password=password,
                    host=host,
                    port=port,
                    database=dbname,
                    cursor_factory=psycopg2.extras.RealDictCursor
                )
            else:
                connection = psycopg2.connect(dsn, user=username, password=password, cursor_factory=psycopg2.extras.RealDictCursor)
            return connection
        else:
            wallet_location = params.get("wallet_location")
            if wallet_location:
                connection = oracledb.connect(user=username, password=password,
                                                 dsn=params.get("dsn"),
                                                 config_dir=wallet_location,
                                                 wallet_location=wallet_location,
                                                 wallet_password=params.get("wallet_password"))
            else:
                connection = oracledb.connect(user=username, password=password, dsn=params.get("dsn"))
            connection.outputtypehandler = output_type_handler
            return connection
    except Exception as e:
        fail_request(401, description=str(e))

def get_cursor(connection, sql, binds):
    """Create a cursor and execute a SQL statement"""
    is_postgres = hasattr(connection, 'cursor_factory')
    try:
        cursor = connection.cursor()
        if not is_postgres:
            cursor.execute("set transaction read only")
            
        if binds is None or not binds:
            cursor.execute(sql)
        else:
            if is_postgres:
                # Convert Oracle-style binds to Postgres
                import re
                if isinstance(binds, dict):
                    # Convert :name to %(name)s
                    pg_sql = re.sub(r':(\w+)', r'%(\1)s', sql)
                    cursor.execute(pg_sql, binds)
                else:
                    # Convert :1, :2 or :any to %s for positional binds
                    pg_sql = re.sub(r':\w+', '%s', sql)
                    cursor.execute(pg_sql, binds)
            else:
                cursor.execute(sql, binds)
        return cursor
    except Exception as e:
        fail_request(400, description=str(e))

@bp.route('/healthz')
@bp.route('/')
def healthz():
    return "healthy"

@bp.route('/sql/<endpoint>', methods=['GET'])
def get_endpoint(endpoint):
    params = current_app.endpoints.get(endpoint)
    if params is None:
        return ""
    if isinstance(params, str):
        return params
    return params.get('dsn', '')

@bp.route('/sql', methods=['POST'])
@bp.route('/sql/<endpoint>', methods=['POST'])
def run_sql(endpoint=None):
    """Main entry point for running SQL and streaming results"""
    start_time = time.time()
    if not request.json or 'sql' not in request.json:
        fail_request(400, description="Missing 'sql' in request body")
    
    sql = request.json.get('sql')
    if endpoint is None:
        endpoint = request.json.get('endpoint')
    
    # Get credentials from X-DB-Credentials header or similar
    auth = request.headers.get('X-DB-Credentials')
    if auth:
        try:
            decoded_auth = base64.b64decode(auth).decode('utf-8')
            if ':' in decoded_auth:
                username, password = decoded_auth.split(':', 1)
            elif '/' in decoded_auth:
                parts = decoded_auth.split('/', 1)
                username = parts[0]
                if '@' in parts[1]:
                    password, _ = parts[1].split('@', 1)
                else:
                    password = parts[1]
            else:
                username = decoded_auth
                password = ""
        except Exception as e:
            fail_request(401, description=f"Invalid X-DB-Credentials header: {str(e)}")
    else:
        # Fallback to basic auth
        if request.authorization:
            username = request.authorization.username
            password = request.authorization.password
        else:
            fail_request(401, description="Missing database credentials")

    params = get_connection_params(endpoint)
    options = validate_options(request.json.get('options'))
    
    # Validate SQL - only SELECT allowed
    sql_upper = sql.strip().upper()
    if not (sql_upper.startswith('SELECT') or sql_upper.startswith('WITH')):
        fail_request(403, description="SQL statement is not of type SELECT")

    # Validate binds
    binds = request.json.get('binds')
    if binds:
        if isinstance(binds, list):
            for item in binds:
                if isinstance(item, dict):
                    fail_request(400, description="Bind variables must be a simple array")
        elif not isinstance(binds, dict):
            fail_request(400, description="Bind variables must be a simple array or object")

    download_lobs = get_option('downloadLobs', 'N')
    
    # Determine output format
    output_format = get_option('format', None)
    if not output_format:
        if request.headers.get('Accept') == 'application/json':
            output_format = 'json'
        else:
            output_format = 'csv'

    connection = get_connection(username, password, params)
    cursor = get_cursor(connection, sql, binds)

    if output_format == 'csv':
        return pipe_results_as_csv(connection, cursor, start_time, download_lobs)
    else:
        return pipe_results_as_json(connection, cursor, start_time, download_lobs)

def execute_sql_internal(endpoint, sql_query, username, password):
    """Internal function to execute SQL queries for MCP endpoints."""
    try:
        conn_params = get_connection_params(endpoint)
        sql_query_clean = sql_query.strip()
        sql_query_for_execution = sql_query_clean.rstrip(';')

        connection = get_connection(username, password, conn_params)
        is_postgres = hasattr(connection, 'cursor_factory')
        
        cursor = get_cursor(connection, sql_query_for_execution, None)

        if is_postgres:
            rows = cursor.fetchall()
            result = []
            for row in rows:
                processed_row = {k: convert_db_value(v, 'Y') for k, v in row.items()}
                result.append(processed_row)
        else:
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            result = []
            for row in rows:
                row_dict = {}
                for i, value in enumerate(row):
                    row_dict[columns[i]] = convert_db_value(value, 'Y')
                result.append(row_dict)

        cursor.close()
        connection.close()
        return result
    except Exception as e:
        current_app.logger.error(f"Error executing SQL internally for endpoint '{endpoint}': {e}")
        raise

def get_connection_params(endpoint):
    """Get the connection parameters for a registered endpoint"""
    params = current_app.endpoints.get(endpoint)
    if params is None:
        fail_request(404, description=f"Endpoint '{endpoint}' not found")
    if isinstance(params, str):
        return {"dsn": params, "dbType": "oracle"}
    return params

def validate_binds(binds):
    if isinstance(binds, list) and all(isinstance(item, (str, int, float)) for item in binds):
        return binds
    elif isinstance(binds, dict) and all(isinstance(item, (str, int, float)) for item in binds.values()):
        return binds
    elif binds is None:
        return []
    else:
        fail_request(400, description="Invalid bind variables")

def validate_options(options):
    if isinstance(options, dict):
        return options
    elif options is None:
        return {}
    else:
        fail_request(400, description="Options must be a JSON object")