// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiBase: window.location.protocol + '//' + window.location.hostname + ':3003/api',
  findObjectBase: window.location.protocol + '//' + window.location.hostname + ':3003/find',
  ddlGenBase: window.location.protocol + '//' + window.location.hostname + ':3003/ddl',
  queryBase:  window.location.protocol + '//' + window.location.hostname + ':5000/sql',
  internalSchemas:
  ['ANONYMOUS','APPQOSSYS','AUDSYS','CTXSYS','DBSFWUSER','DBSNMP','DIP','DVF','DVSYS',
   'GGSYS','GSMADMIN_INTERNAL','GSMCATUSER','GSMUSER','LBACSYS','MDSYS','OJVMSYS','OLAPSYS',
   'ORACLE_OCM','ORDDATA','ORDPLUGINS','ORDSYS','OUTLN','PUBLIC','REMOTE_SCHEDULER_AGENT',
   'SI_INFORMTN_SCHEMA','SYS$UMF','SYS','SYSBACKUP','SYSDG','SYSKM','SYSRAC','SYSTEM',
   'WMSYS','XDB','XS$NULL']
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
