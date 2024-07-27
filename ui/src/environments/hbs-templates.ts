// Map containing the Handlebars templates used by the application.
interface Template {
  title: string;
  template: string;
}

export const hbsTemplates: Map<string, Template[]> = new Map();

hbsTemplates.set('TABLE', [
  {title: 'CRUD Package', template: 'plsql_api_gen.hbs'},
  {title: 'Checksum View', template: 'checksum_view.hbs'},
  {title: 'CSV Dump Script', template: 'csv_gen.hbs'},
  {title: 'SQL*Loader Control File', template: 'gen_sql_loader_control_file.hbs'},
  {title: 'Google BigQuery DDL', template: 'bqddl.hbs'}
]);

hbsTemplates.set('VIEW', [
  {title: 'CSV Dump Script', template: 'csv_gen.hbs'},
]);

hbsTemplates.set('MATERIALIZED VIEW', [
  {title: 'CSV Dump Script', template: 'csv_gen.hbs'},
]);

hbsTemplates.set('PACKAGE', [
  {title: 'Procedure and function calls', template: 'plsql_package_call.hbs'},
]);

hbsTemplates.set('PACKAGE BODY', [
  {title: 'Node JS SQL Statements', template: 'plsql2nodejs.hbs'},
]);
