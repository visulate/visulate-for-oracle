# Visulate for Oracle Setup Instructions
Visulate needs access to the data dictionary in the Oracle database.  Use the
create_visulate_user.sql script to create a user to do this.  This script creates
a database user called "visulate" and grants "create session" and "select any dictionary"
privileges to it.  The script accepts the password for the new user as an
argument.
A separate script drop_visulate_user.sql can be used to drop the account when it
is no longer required.
