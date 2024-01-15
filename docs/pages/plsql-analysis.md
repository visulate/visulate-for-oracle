* TOC
{:toc id="toc"}
# Analyzing PL/SQL

Visulate for Oracle generates documentation for every object in an Oracle database including all PL/SQL packages, procedures and package bodies. The object selection menu can be used to identify every PL/SQL object in a schema.

## Review the structure of a PL/SQL object

Selecting an object opens a report showing its source code

![Package Body](/images/hamburger-menu.png){: class="screenshot" tabindex="0" }

It also extracts SQL statements and lists dependencies.

![SQL Statements](/images/sql-statements.png){: class="screenshot" tabindex="0" }

 Each dependency appears as a link to the corresponding object and includes a reference to the line number in the source code where the dependency appears.

![Dependencies](/images/plsql-dependencies.png){: class="screenshot" tabindex="0" }

## Identify package differences in 2 databases

The Download DDL link in the menu can be used to generate a file with DDL for the listed objects.

![DDL](/images/ddl-download.png){: class="screenshot" tabindex="0" }

This can be used to identify differences between packages, procedures or package bodies in different databases. Simply generate the file for each database and then diff them.