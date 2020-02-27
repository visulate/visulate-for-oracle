/**
 * Production kubernetes deployment relies on GKE L7 ingress load balancer rules
 */
export const environment = {
  production: true,
  apiBase: '/api',
  findObjectBase: '/find',
  ddlGenBase: '/ddl'
};