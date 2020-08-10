/**
 * Production kubernetes deployment relies on GKE L7 ingress load balancer rules
 */
export const environment = {
  production: true,
  apiBase: '/api',
  findObjectBase: '/find',
  ddlGenBase: '/ddl',
  queryBase:  window.location.protocol + '//' + window.location.hostname + '/sql',
  internalSchemas:
  ['ANONYMOUS','APPQOSSYS','AUDSYS','CTXSYS','DBSFWUSER','DBSNMP','DIP','DVF','DVSYS',
   'GGSYS','GSMADMIN_INTERNAL','GSMCATUSER','GSMUSER','LBACSYS','MDSYS','OJVMSYS','OLAPSYS',
   'ORACLE_OCM','ORDDATA','ORDPLUGINS','ORDSYS','OUTLN','PUBLIC','REMOTE_SCHEDULER_AGENT',
   'SI_INFORMTN_SCHEMA','SYS$UMF','SYS','SYSBACKUP','SYSDG','SYSKM','SYSRAC','SYSTEM',
   'WMSYS','XDB','XS$NULL']
};
