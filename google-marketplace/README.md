# Google Marketplace Integration

## Architecture

![K8S Architecture](/docs/images/k8s.png)

The API Server Deployment provisions a Node JS instance and 2 sidecar containers.  One echos logfile data to stdout for display in Stackdriver. The other integrates with [Google's billing infrastructure](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/blob/64181befcb4d3a5417e84d4f59fea82b016988ab/docs/billing-integration.md). The API Server Service exposes a NodePort which connects to the API Server Instance containter.

The UI Deployment provisions an Angular/Nginx instance with a sidecar containter to echo logfiles. The UI Service exposes a NodePort which connects to this. 

Web users connect to the application via an Ingress resource. Http path rules in the ingress spec route requests to the UI or API Service as required. 

Database registration is performed using a Secret. The Secret manifest delivers the database.js configuration file that the Express server reads during initialization as part of the API Server deployment

## Configuration

The application is configured using a Helm chart located in the chart/visulate-for-oracle directory. Templates values are passed into the chart during deployment from the schema.yaml file. Values are copied from it into the chart/visulate-for-oracle/values.yaml file for use by Helm. This mirrors the production behavior where values are passed from GCP Marketplace form. 

The contents of the Marketplace form are controled by the schema.yaml file and values submitted on the [partner solutions page](https://console.cloud.google.com/partner/solutions?project=visulate-llc-public)


```
export REGISTRY=gcr.io/$(gcloud config get-value project | tr ':' '/')
export APP_NAME=visulate-for-oracle

docker build --tag $REGISTRY/$APP_NAME/deployer -f deployer/Dockerfile .
docker push $REGISTRY/$APP_NAME/deployer

mpdev /scripts/install   --deployer=$REGISTRY/$APP_NAME/deployer   --parameters='{"name": "test-deployment", "namespace": "test-ns"}'

mpdev /scripts/install   --deployer=$REGISTRY/$APP_NAME/deployer   --parameters='{"name": "test-deployment31", "namespace": "test-ns", "reportingSecret": "gs://cloud-marketplace-tools/reporting_secrets/fake_reporting_secret.yaml"}'

mpdev verify --deployer=$REGISTRY/$APP_NAME/deployer
```
