# Testing
The testrunner.js script runs end-to-end tests against an API server with at least 2 registered databases.  One of these should be an 11g non PDB instance.  The other should be a 12i or later PDB instance.  These can be set by editing the `NON_PDB` and `PDB` global variables in the testrunner.js script or setting `VISULATE_NON_PDB` and `VISULATE_PDB` environment variables before running the tests.

Both instances must have a `WIKI` schema. The DDL for this is in the `sample-schema` directory. Login as `SYSTEM` and run the `create-test-user.sql` script to create a `WIKI` user then connect to the user (`conn wiki/wiki`) and run the `install-test-schema.sql` script to create objects referenced by the tests. Note the `WIKI.RNT_USERS_PKG` package body will be invalid.

Use `npm test` to run the test suite.