* TOC
{:toc id="toc"}
# Updating Visulate for Oracle

This page describes the process to update a live instance of Visulate for Oracle when a new version is released.

## VM Upgrade Process

Use the **update-visulate** alias from the [Quickstart Guide](/pages/quickstart.html#post-install-setup) to pull the latest container images and then use docker-compose to restart the application:

```
update-visulate

 latest: Pulling from docker/compose
 Digest: sha256:b60a020c0f68047b353a4a747f27f5e5ddb17116b7b018762edfb6f7a6439a82
 Status: Image is up to date for docker/compose:latest
 docker.io/docker/compose:latest
 2.0: Pulling from visulate-llc-public/visulate-for-oracle
 Digest: sha256:c09c621f9b5d419b8ec07d6ef4c6cd1003d40c9a7f035e8c4cf1d4ba5c4c135b
 Status: Image is up to date for gcr.io/visulate-llc-public/visulate-for-oracle:2.0
 gcr.io/visulate-llc-public/visulate-for-oracle:2.0
 2.0: Pulling from visulate-llc-public/visulate-for-oracle/ui
 Digest: sha256:32d073e0d67e1eca50756c940d720733cdd387e28da6a65ae445c751c9f9784e
 Status: Image is up to date for gcr.io/visulate-llc-public/visulate-for-oracle/ui:2.0
 gcr.io/visulate-llc-public/visulate-for-oracle/ui:2.0
 2.0: Pulling from visulate-llc-public/visulate-for-oracle/sql
 Digest: sha256:f4510ce604a17031cdd2e4e634ae89483e0c519753d10b392c0100ebb065ab4e
 Status: Image is up to date for gcr.io/visulate-llc-public/visulate-for-oracle/sql:2.0
 gcr.io/visulate-llc-public/visulate-for-oracle/sql:2.0
 2.0: Pulling from visulate-llc-public/visulate-for-oracle/proxy
 Digest: sha256:ddc6cbae74c01143d3ac22810ef0f1ca4a57165ad537edc0d3e2ae1258483616
 Status: Image is up to date for gcr.io/visulate-llc-public/visulate-for-oracle/proxy:2.0
 gcr.io/visulate-llc-public/visulate-for-oracle/proxy:2.0

cd /home/visulate
docker-compose down
docker-compose up -d
```

## Kubernetes Upgrade Process

1. Follow the steps described in the [Quickstart Guide](/pages/quickstart-k8s.html) to provision a new Visulate instance.

2. Re-use the [database registration](/pages/database-registration.html#apply-a-new-kubernetes-secret)
and [SQL endpoints](/pages/query-engine-config.html#apply-the-endpointsjson-file-as-a-new-kubernetes-secret)
secrets from your current instance. Follow the steps in the [TLS certification guide](/pages/tls-cert.html) if required.

    **Tip:** Review the [troubleshooting guide](/pages/troubleshooting.html#lost-database-registration-file) if you've lost your database registration file

3. Update the load balancer to use the Zonal NEG associated with the new environment

4. Test the application

5. Delete the old version from the [Kubernetes Applications](https://console.cloud.google.com/kubernetes/application) screen.