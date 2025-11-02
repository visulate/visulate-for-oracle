import csv
import sys
import simplejson as json
import oracledb
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
    # This function is called *within* the request context
    query = request.json
    options = query.get('options')
    if options is not None:
        return options.get(option, default)
    else:
        return default

def dump_oracle_object_to_dict(obj):
    """
    Recursively converts an oracledb.Object (or collection) into a dictionary or list.
    """
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

def convert_db_value(value, download_lobs_flag): # Now accepts download_lobs_flag
    """
    Converts a single database value to a Python-friendly format suitable for JSON/CSV.
    Handles LOBs, bytes, datetimes, and oracledb.Objects.
    """
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
    """
    Modify the fetched data types for LOB and OBJECT columns.
    For LOBs, we set long types to enable direct reading.
    For OBJECTs, we just let oracledb return the Object directly; conversion
    happens later in pipe_results_as_json/pipe_results.
    """
    if default_type == oracledb.CLOB:
        return cursor.var(oracledb.DB_TYPE_LONG, arraysize=cursor.arraysize)
    if default_type == oracledb.BLOB:
        return cursor.var(oracledb.DB_TYPE_LONG_RAW, arraysize=cursor.arraysize)

    object_typename = get_option("oracle_object_type", None)
    if default_type == oracledb.OBJECT and object_typename is not None:
        return cursor.var(default_type, arraysize=cursor.arraysize, typename=object_typename)

    if default_type == oracledb.DB_TYPE_VARCHAR:
        return cursor.var(default_type, size, arraysize=cursor.arraysize, encodingErrors="replace")

    return None

def pipe_results(connection, cursor, csv_header, download_lobs): # Added download_lobs
    """Loop through a SQL statement's result set and return as CSV"""
    if cursor is None:
        connection.close()
        yield "Statement processed"
        return

    line = Line()
    writer = csv.writer(line, delimiter=',', lineterminator="\n", quoting=csv.QUOTE_NONNUMERIC)

    try:
        if csv_header.upper() == "Y":
            columns = [col[0] for col in cursor.description]
            writer.writerow(columns)
            yield line.read()

        for row in cursor:
            # Pass download_lobs directly to convert_db_value
            processed_row = [convert_db_value(value, download_lobs) for value in row]
            final_csv_row = []
            for item in processed_row:
                if isinstance(item, (dict, list)):
                    final_csv_row.append(json.dumps(item, default=str))
                else:
                    final_csv_row.append(item)
            writer.writerow(final_csv_row)
            yield line.read()

        cursor.close()
        connection.close()
    except oracledb.DatabaseError as e:
        errorObj, = e.args
        fail_request(400, description=errorObj.message)
    except Exception as e:
        fail_request(500, description=f"Error processing CSV results: {str(e)}")

def pipe_results_as_json(connection, cursor, start_time, download_lobs): # Added download_lobs
    """Loop through a SQL statement's result set and return as a JSON object"""
    if cursor is None:
        connection.close()
        return Response('{"message": "Statement processed"}', mimetype='application/json')

    def generate(download_lobs_arg): # Generator now accepts download_lobs as an argument
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
                for i, col_value in enumerate(row):
                    col_name = columns[i]
                    # Use the argument passed to the generator
                    row_dict[col_name] = convert_db_value(col_value, download_lobs_arg)

                yield(json.dumps(row_dict, default=str))

            cursor.close()
            connection.close()
            yield('\n],')
            yield(f'"executionTime":{json.dumps(time.time() - start_time)} \n')
            yield('}')
        except oracledb.DatabaseError as e:
            errorObj, = e.args
            current_app.logger.error(f"Database Error during JSON streaming: {errorObj.message}")
            yield(f'{{"error": "Database Error: {errorObj.message}"}}')
        except Exception as e:
            current_app.logger.error(f"Error during JSON streaming: {str(e)}")
            yield(f'{{"error": "Internal Server Error: {str(e)}"}}')

    # Pass download_lobs to the generator when creating the Response
    return Response(generate(download_lobs), mimetype='application/json')

def get_connection(username, password, params):
    """Get an Oracle database connection"""
    try:
        # Check for wallet parameters and initialize the client if needed
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
    except oracledb.DatabaseError as e:
        errorObj, = e.args
        fail_request(401, description=errorObj.message)
    else:
        return connection

def get_cursor(connection, sql, binds):
    """Create a cursor and execute a SQL statement"""
    try:
        cursor = connection.cursor()
        cursor.execute("set transaction read only")
        if binds is None or not binds:
            return cursor.execute(sql)
        else:
            return cursor.execute(sql, binds)
    except oracledb.DatabaseError as e:
        errorObj, = e.args
        fail_request(400, description=errorObj.message)

def execute_sql_internal(endpoint, sql_query, username, password):
    """
    Internal function to execute SQL queries for MCP endpoints.
    Returns the result as a Python object (list of dicts).
    """
    try:
        # Get connection parameters
        conn_params = get_connection_params(endpoint)

        # Validate SQL is SELECT only
        # Clean the SQL query (remove extra whitespace, ensure proper formatting)
        sql_query_clean = sql_query.strip()
        if not sql_query_clean.endswith(';'):
            # Add semicolon if missing, but remove it for Oracle execution
            sql_query_for_parsing = sql_query_clean
            sql_query_for_execution = sql_query_clean
        else:
            sql_query_for_parsing = sql_query_clean
            sql_query_for_execution = sql_query_clean.rstrip(';')
        
        statements = list(sqlparse.parse(sql_query_for_parsing))
        current_app.logger.info(f"Parsed {len(statements)} SQL statements")
        
        for i, statement in enumerate(statements):
            statement_type = statement.get_type()
            current_app.logger.info(f"Statement {i+1} type: {statement_type}")
            if statement_type != 'SELECT':
                raise ValueError(f'SQL statement {i+1} is not of type SELECT (got: {statement_type})')

        # Establish connection
        connection = get_connection(username, password, conn_params)
        cursor = get_cursor(connection, sql_query_for_execution, None)

        # Fetch all results
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        # Convert to list of dictionaries
        result = []
        for row in rows:
            row_dict = {}
            for i, value in enumerate(row):
                column_name = columns[i]
                # Handle Oracle-specific data types
                if hasattr(value, 'read'):  # LOB object
                    row_dict[column_name] = value.read()
                elif isinstance(value, (datetime.datetime, datetime.date)):
                    row_dict[column_name] = value.isoformat()
                else:
                    row_dict[column_name] = value
            result.append(row_dict)

        # Clean up
        cursor.close()
        connection.close()

        return result

    except Exception as e:
        current_app.logger.error(
            f"Error executing SQL internally for endpoint '{endpoint}', user '{username}': {e}"
        )
        current_app.logger.error(f"SQL query length: {len(sql_query)} characters")
        current_app.logger.error(f"SQL query (first 500 chars): {sql_query[:500]}")
        if hasattr(e, 'args') and len(e.args) > 0:
            current_app.logger.error(f"Error details: {e.args}")
        raise


def get_connection_params(endpoint):
    """Get the connection parameters for a registered endpoint"""
    params = current_app.endpoints.get(endpoint)
    if params is None:
        fail_request(404, description=f"Endpoint '{endpoint}' not found")
    # If params is just a string, convert it to the dict structure for backward compatibility
    if isinstance(params, str):
        return {"dsn": params}
    return params

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

def decode_credentials(encoded_str):
    # Decode the Base64 string
    decoded_bytes = base64.b64decode(encoded_str)
    decoded_str = decoded_bytes.decode('utf-8')

    # Split the string into components
    user_password, endpoint = decoded_str.split('@')
    user, password = user_password.split('/')
    return user, password, endpoint


@bp.route('/', methods=['GET'])
@bp.route('/healthz', methods=['GET'])
def healthz():
    response = make_response('healthy', 200)
    response.mimetype="text/plain"
    return response

@bp.route('/sql/<endpoint>', methods=['POST', 'GET'])
def sql2csv(endpoint):
    """Generate a CSV file or JSON object from a SQL statement"""

    if request.method == 'POST':
        query = request.json
        conn_params = get_connection_params(endpoint)
        httpHeaders = request.headers
        dbCredentials = httpHeaders.get('X-DB-Credentials')
        if dbCredentials is not None:
            user, passwd, db = decode_credentials(dbCredentials)
        else:
            fail_request(401, description='Missing X-DB-Credentials header')

        if db != endpoint:
            fail_request(403, description='Invalid endpoint credentials')

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

        start_time = time.time()
        connection = get_connection(user, passwd, conn_params)
        cursor = get_cursor(connection, sql, vbinds)

        # Retrieve download_lobs here, within the request context
        download_lobs = get_option("download_lobs", "N")
        csv_header = get_option("csv_header", "N") # Also for CSV

        if httpHeaders.get('accept') == 'application/json':
            # Pass download_lobs to the streaming function
            response = pipe_results_as_json(connection, cursor, start_time, download_lobs)
        else:
            # Pass download_lobs to the streaming function
            response = Response(pipe_results(connection, cursor, csv_header, download_lobs),
                                mimetype='text/csv')

        return response

    # return connect string or empty string for GET request
    conn_params = current_app.endpoints.get(endpoint)
    dsn = ""
    if conn_params is None:
        dsn = ""
    elif isinstance(conn_params, dict):
        dsn = conn_params.get("dsn", "")
    elif isinstance(conn_params, str): # Keep backward compatibility
        dsn = conn_params

    response = make_response(dsn, 200)
    response.mimetype="text/plain"
    return response