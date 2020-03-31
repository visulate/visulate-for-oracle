# Visulate for Oracle
Visulate for Oracle is an Oracle data dictionary browsing service to help data engineers understand the structure and dependencies in Oracle databases that they plan to migrate to the Cloud.

## Functionality
A registration file stores connection details for one or more the databases.  Visulate queries the data dictionary for each connection and allows the user to browse the result. It also allows DDL to be generated for individual objects or groups of objects.

![Alt text](docs/images/object-selection.png?raw=true "Visulate for Oracle database object selection")

A report is generated for each database object by querying the appropriate dictionary views (e.g. DBA_TABLES and other views for table objects or DBA_SOURCE for packages)  

![Alt text](docs/images/object-details.png?raw=true "Visulate for Oracle object details")

This report also queries database's dependency model to identify dependencies to and from the object (e.g a view "uses" the tables it is based on and is "used by" a procedure that selects from it).  The dependency info identifies line numbers for references that appear in stored procedures.

![Alt text](docs/images/object-dependencies.png?raw=true "Visulate for Oracle object dependencies")

## Implementation
Visulate for Oracle exposes REST endpoints and a UI to browse the metadata for registered connections. The API server is implemented in Express and uses node-oracledb to connect to the database(s).  Connections are registered in a configuration file (database.js) located in the config directory. A separate file (http-server.js) in the same directory controls the behavior of the Express server.

The start point for the Express server is app.js.  Most of the source code is in the api-server/services directory. Registered databases  must connect to a user with the SELECT ANY DICTIONARY privilege. The setup directory includes a script to create a user with the minimum required privileges. The SYSTEM account would also work (in a non-production environment) or you can grant SELECT ANY DICTIONARY to an existing user.

An Angular UI makes API calls to the Express server and displays the result. The source code for this is in the ui directory. It reads the apiBase property in the `src/environments/environment.ts` (or environment.prod.ts) file to identify the base url for API calls. 

The API server supports cross origin (CORS) requests from locations identified in the `config/http-server.js` file.  The default configuration accepts requests from localhost:4200.  The configuration file can be edited to support other locations.

## Setup Instructions (Development Environment)
1. Clone the repo
2. Run `npm install` in the following directories
 - api-server 
 - ui  
3. Follow the instruction in https://oracle.github.io/node-oracledb/INSTALL.html#quickstart to install node-oracledb.
4. Use the script in the setup directory to setup a database user with the SELECT ANY DICTIONARY privilege in each database you want to register.
5. Edit the `config/database.js` file to register the databases
6. (Optional) edit the `config/http-server.js` file to change the port number and Angular client location
7. Run `npm start` in the project root to start the API server.
8. Make an API call to test the configuration e.g. `curl localhost:3000/api` or `curl localhost:3000/api | json_pp`
9. (Optional) edit the `src/environments/environment.ts` file if the API server is running on a different port.
9. Run `ng serve` from the client directory to start the Angular client
9. Navigate to `localhost:4200` in a browser window to view the result.

## Testing
Follow the instructions in the test directory to setup the test environment then
1. Run `npm test` from the project root to test the API server
2. Run `ng test` from the client directory to run unit tests for the client

## Docker Deployment
1. Angular stores environment variables like the API server location in a file that gets copied into the app bundle at build time. The file contents are concatenated with other sources into a single minified file. The file checked into source control relies on a load balancer to resolve API calls. It needs to be edited if a load balancer is not being used. Review apiBase value in `visulate-for-oracle/ui/src/environments/environment.prod.ts` and edit to match the API server deployment value. For example, if you plan to deploy the API server on a VM called my-api-server.com the file would look like this: 
```
export const environment = {
  production: true,
  apiBase: 'http://my-api-server.com:3000/api',
  findObjectBase: 'http://my-api-server.com:3000/find',
  ddlGenBase: 'http://my-api-server.com:3000/ddl'
};
```
2. The API server rejects cross origin requests from URLs that have not been whitelisted. Edit `visulate-for-oracle/api-server/config/http-server.js` to specify the origin server where the UI will be running. For example if the UI will be served from port 8080 of my-ui-server.com:
```
module.exports = {
  port: process.env.HTTP_PORT || 3000 ,
  corsOriginWhitelist: process.env.CORS_ORIGIN_WHITELIST ||['http://my-ui-server.com:8080'],
  logFileLocation: process.env.PWD + '/logs'
};
```
3. Build the docker images:
```
docker build --rm -t visulate-server:latest ./api-server
docker build --rm -t visulate-client:latest ./ui
```
4. Deploy the images:
```
docker run -d -p 3000:3000/tcp visulate-server:latest
docker run -d -p 80:80/tcp visulate-client:latest
```
5. (Optional) bind the log file directories to a persistent volume (e.g /var/log/some-directory)
```
docker run -d -p 3000:3000/tcp -v /var/log/visulate-server:/visulate-server/logs visulate-server:latest
docker run --rm -d -p 80:80/tcp -v /var/log/visulate-client:/var/log/nginx visulate-client:latest
```
6. (Optional) Copy the `visulate-for-oracle/config` files to a staging directory before starting the server. This will allow you to edit the database registration file and CORS whitelist without rebuilding the image. Example:
```
docker run -d -p 3000:3000/tcp -v /home/pgoldtho/config:/visulate-server/config visulate-server:latest
```
## Kubernetes Deployment
Comming soon! Visulate for Oracle will soon be available from Google Cloud Marketplace.