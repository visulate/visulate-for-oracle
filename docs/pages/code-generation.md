* TOC
{:toc id="toc"}
# Code Generation

Visulate provides 2 mechanisms for code generation:

- Generative AI
- Template driven

## Generative AI

Generative AI code generation uses a large language model (LLM) to generate code based on the metadata for a given database object. Visulate sends this metadata to the LLM along with a user request in a chat window as shown in the example below:

![Visulate code gen](/images/code-gen-ai.png){: class="screenshot" tabindex="0" }

The chat window allows the user to interact with the LLM and request refinements to the generated code. A `Download Messages` button allows the result to be saved to a text file.

## Template Driven

Template driven code generation uses handlebars templates to transform database metadata into code. The result can be accessed via a drop down in the UI or an API call

![Visulate code gen](/images/code-gen-template.png){: class="screenshot" tabindex="0" }

### Default Templates

The Visulate application delivers a set of sample templates via a config map called *App instance name*-hbs-templates.

![Handlebars template config map](/images/codegen-config-map.png){: class="screenshot" tabindex="0" }

| Template Name | Description |
| ------------- | ----------- |
| plsql_package_call.hbs | Generate code to call procedures and functions in a PL/SQL package |
| plsql_api_gen.hbs | Generate a PL/SQL package to handle create, retrieve, update and delete operations for a given table |
| checksum_view.hbs | Create an Oracle view from a table definition with a column for each column in the table plus a checksum column based on values for the columns. Used in web forms to detect changes in tables that do not have audit columns. |
| curl_from_list.hbs | Generate curl statements from a list of objects|
| gen_crud_objects_from_list.hbs | Generate plsql_api_gen API calls for a list of tables |
| generate_csv_files.hbs | Generate a shell script to download CSV files for a list of tables |
| sql_loader.mu | Mustache template to generate a SQL*Loader control file |


### User defined templates

The database object and object list APIs include an optional `template` parameter. It accepts the name of a handlebars or mustache template. This template is used to transform the API's result set.

#### Example

Passing `plsql_package_call.hbs` to the template parameter for a PL/SQL package will transform the JSON document that the API returns into a plain text response with the PL/SQL code to call the public functions and procedures in the package:

![Swagger UI template parameter](/images/codegen-swagger-ui.png){: class="screenshot" tabindex="0" }

```shell
curl -X GET \
"https://catalog2.rmgr.com/api/rmg119/WIKI/PACKAGE/RNT_MENUS_PKG?template=plsql_package_call.hbs" \
-H  "accept: application/json"
```

Responds with:

```
/**************************************************************
  API Calls
***************************************************************/

-----------------------------------------------------
-- GET_CHECKSUM
-----------------------------------------------------
GET_CHECKSUM_VALUE := RNT_MENUS_PKG.GET_CHECKSUM
  ( X_TAB_NAME =>   -- IN VARCHAR2(32)
  , X_MENU_NAME =>   -- IN VARCHAR2(32)
);


-----------------------------------------------------
-- UPDATE_ROW
-----------------------------------------------------
RNT_MENUS_PKG.UPDATE_ROW
  ( X_TAB_NAME =>   -- IN VARCHAR2(32)
  , X_MENU_NAME =>   -- IN VARCHAR2(32)
  , X_MENU_TITLE =>   -- IN VARCHAR2(32)
  , X_DISPLAY_SEQ =>   -- IN NUMBER(22)
  , X_CHECKSUM =>   -- IN VARCHAR2(4000)
);


-----------------------------------------------------
-- INSERT_ROW
-----------------------------------------------------
RNT_MENUS_PKG.INSERT_ROW
  ( X_TAB_NAME =>   -- IN VARCHAR2(32)
  , X_MENU_NAME =>   -- IN VARCHAR2(32)
  , X_MENU_TITLE =>   -- IN VARCHAR2(32)
  , X_DISPLAY_SEQ =>   -- IN NUMBER(22)
);


-----------------------------------------------------
-- DELETE_ROW
-----------------------------------------------------
RNT_MENUS_PKG.DELETE_ROW
  ( X_TAB_NAME =>   -- IN VARCHAR2(32)
  , X_MENU_NAME =>   -- IN VARCHAR2(32)
);

end;
/
```
