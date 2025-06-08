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

Use `helm` to preview and debug the template:

```
cd google-marketplace/chart/visulate-for-oracle
helm  template $APP_NAME-2004 . > generated.yaml
cat generated.yaml
```

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

## VM Image



```
gcloud compute instances create vm-visulate4oracle \
  --project=visulate-app \
  --zone=us-east1-b \
  --machine-type=e2-medium \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-ssd \
  --network=projects/visulate-docker/global/networks/visulate-docker-vpc  \
  --subnet=projects/visulate-docker/regions/us-east1/subnetworks/us-east1-01  \
  --tags=http-server \
  --scopes=https://www.googleapis.com/auth/cloud-platform  \
  --metadata-from-file=startup-script=./vm-image/startup-script.sh
```

Wait for VM to respond then shutdown and create a boot disk image


sudo journalctl -u google-startup-scripts.service

gcloud compute images create visulate-vm-feb25  \
  --project visulate-llc-public  \
  --source-disk projects/visulate-app/zones/us-east1-b/disks/vm-visulate4oracle  \
  --licenses projects/visulate-llc-public/global/licenses/cloud-marketplace-bb6cb067de6855d1-df1ebeb69c0ba664  \
  --description "Visulate for Oracle VM image - Feb 2025"



## Reference
1. [Marketplace Tools](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools)
2. [Billing Integration](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/blob/master/docs/billing-integration.md)
3. [Example Deployments](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-example)
4. [More Examples](https://github.com/GoogleCloudPlatform/click-to-deploy/tree/master/k8s)
5. [Partner Docs](https://cloud.google.com/marketplace/docs/partners/kubernetes-solutions)
6. [marketplace-k8s-app-tools](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/blob/master/docs)
