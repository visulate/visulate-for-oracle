# Google Marketplace Integration

## Architecture

![K8S Architecture](/docs/images/k8s.png)

The API Server Deployment provisions a Node JS instance and 2 sidecar containers.  One echos logfile data to stdout for display in Stackdriver. The other integrates with [Google's billing infrastructure](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/blob/64181befcb4d3a5417e84d4f59fea82b016988ab/docs/billing-integration.md). The API Server Service exposes a NodePort which connects to the API Server Instance container.

The UI Deployment provisions an Angular/Nginx instance with a sidecar container to echo logfiles. The UI Service exposes a NodePort which connects to this.

Web users connect to the application via an Ingress resource. Http path rules in the ingress spec route requests to the UI or API Service as required.

Database registration is performed using a Secret. The Secret manifest delivers the database.js configuration file that the Express server reads during initialization as part of the API Server deployment

## Configuration

The application is configured using a Helm chart located in the chart/visulate-for-oracle directory. Templates values are passed into the chart during deployment from the schema.yaml file. Values are copied from it into the chart/visulate-for-oracle/values.yaml file for use by Helm. This mirrors the production behavior where values are passed from the GCP Marketplace form.

The contents of the Marketplace form are controlled by the schema.yaml file and values submitted on the [partner solutions page](https://console.cloud.google.com/partner/solutions?project=visulate-llc-public).

## Billing Infrastructure

Billing metrics are defined in a config map (see ubbagent-config.yaml). There are 2 metrics: database_connections and time. Both reported hourly. The time metric uses the ubbagent's built-in "heartbeat" source. The database_connections metric uses a shell script in the util-image. The shell script makes a REST api call to the api endpoint, counts the number of database connections in the json document this returns and then posts the result to the ubbagent endpoint. A sidecar container in the api-server-deployment calls the shell script once per hour.

## Build and Test

Deployment orchestration is performed by a `deployer` image defined in the deployer directory. The deployer defines the UI for users who are deploying the application from the Google Cloud Console and can be executed as a standalone Job. After a user enters the input parameters, the Job's Pod installs all the components of the application, then exits.

The deployer and application images can be tested using the `mpdev` development tools.  Example:

```
export REGISTRY=gcr.io/$(gcloud config get-value project | tr ':' '/')
export APP_NAME=visulate-for-oracle

docker build \
--build-arg REGISTRY=gcr.io/visulate-for-oracle \
--build-arg TAG=1.0.3-7 \
--build-arg MARKETPLACE_TOOLS_TAG=0.9.10 \
--tag $REGISTRY/$APP_NAME/deployer -f deployer/Dockerfile .

docker push $REGISTRY/$APP_NAME/deployer

mpdev /scripts/install  \
--deployer=$REGISTRY/$APP_NAME/deployer \
--parameters='{"name": "td01", "namespace": "test-ns"}'

mpdev verify --deployer=$REGISTRY/$APP_NAME/deployer --wait_timeout=900 > /tmp/mpdev.log
```

Pass a reporting secret to test billing integration:

```
mpdev /scripts/install  \
--deployer=$REGISTRY/$APP_NAME/deployer \
--parameters='{"name": "td01", "namespace": "test-ns", "reportingSecret": "gs://cloud-marketplace-tools/reporting_secrets/fake_reporting_secret.yaml"}'

```

## Reference
1. [Marketplace Tools](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools)
2. [Billing Integration](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/blob/master/docs/billing-integration.md)
3. [Example Deployments](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-example)
4. [More Examples](https://github.com/GoogleCloudPlatform/click-to-deploy/tree/master/k8s)
5. [Partner Docs](https://cloud.google.com/marketplace/docs/partners/kubernetes-solutions)
