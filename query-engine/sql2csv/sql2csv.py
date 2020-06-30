import csv
import cx_Oracle

from flask import (
    Blueprint, Response, request, abort, current_app
)


bp = Blueprint('sql2csv', __name__, url_prefix='/')

class Line(object):
    def __init__(self):
        self._line = None
    def write(self, line):
        self._line = line
    def read(self):
        return self._line


def iter_csv(data):
    line = Line()
    writer = csv.writer(line)
    for csv_line in data:
        writer.writerow(csv_line)
        yield line.read()

def pipe_results(connection, cursor):
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
        print(errorObj.message)
        abort(400, description=errorObj.message)
        

def get_connection(username, password, connectString):
    try:
        connection = cx_Oracle.connect(username, password, connectString)
    except cx_Oracle.DatabaseError as e:
        errorObj, = e.args
        print(errorObj.message)
        abort(401, description=errorObj.message)
    else:
        return connection

def get_cursor(connection, sql, binds):
    try:
        cursor = connection.cursor()
        if binds == None:
            return cursor.execute(sql)
        else:
            return cursor.execute(sql, binds)
    except cx_Oracle.DatabaseError as e:
        errorObj, = e.args
        print(errorObj.message)
        abort(400, description=errorObj.message)     

def get_connect_string(endpoint):
    connectString = current_app.endpoints.get(endpoint)
    if connectString == None:
        abort(404, "Unregistered endpoint")
    else:
        return connectString



@bp.route('/sql/<endpoint>', methods=['POST', 'GET']) 
def sql2csv(endpoint):

    if request.method == 'POST':
        query = request.json
        user = request.authorization.username
        passwd = request.authorization.password
        connStr = get_connect_string(endpoint)

        connection = get_connection(user, passwd, connStr)
        cursor = get_cursor(connection, query.get('sql'), query.get('binds'))

        response = Response(pipe_results(connection, cursor), 
                            mimetype='text/csv')
        response.headers['Content-Disposition'] = 'attachment; filename=data.csv'
        return response
    
    # return connect string or 404 for GET request
    response = get_connect_string(endpoint)
    return response

