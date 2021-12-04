* TOC
{:toc id="toc"}

# Identity-Aware Proxy Configuration

## Overview

Identity-Aware Proxy ([IAP](https://cloud.google.com/iap)) is a Google Cloud Platform service that provides access controls for https resources. IAP secures authentication for https requests and only grants access to users you authorize. This allows users to connect from untrusted networks without using a VPN.

Visulate for Oracle supports IAP via the Ingress component

## Enable IAP

Make sure you have a valid [TLS Certificate](/pages/tls-cert.html) then follow the instructions in [Enabling IAP for GKE](https://cloud.google.com/iap/docs/enabling-kubernetes-howto) and summarized below

### Configure the OAuth consent screen

Open the GCP console and navigate to the OAuth consent screen under APIs & Services

![OAuth Consent Screen](/images/iap-oauth-consent.png){: class="screenshot" }

Select internal as User Type and hit the `Create` button.

![OAuth Consent Screen](/images/iap-oauth-consent2.png){: class="screenshot" }

Enter an App name and support email address then click `Save`.

### Create OAuth credentials

Navigate to to the Credentials page under APIs & Services

![OAuth Client Screen](/images/iap-oauth-client.png){: class="screenshot" }

Select Web application in the Application type drop down, supply an name and click `Create`. This will open a dialog showing a newly created OAuth client ID and secret.

![OAuth Client Secret Screen](/images/iap-oauth-client-secret.png){: class="screenshot" }

Copy the client ID to the clipboard and use the Download JSON link to save the credentials for later use.

![OAuth Redirect URI](/images/iap-redirect-uri.png){: class="screenshot" }

Add a universal redirect URL to the authorized redirect URIs field in the following format

https://iap.googleapis.com/v1/oauth/clientIds/`CLIENT_ID`:handleRedirect

where CLIENT_ID is the OAuth client ID you copied to the clipboard.

### Setup IAP access

Navigate to the Identity-Aware Proxy page under Security. You should see 3 Visulate for Oracle services listed under Backend Services. These will be labeled with -api-svc, -sql-svc and -ui-svc suffixes as shown in the screenshot below. Select the checkboxes for each one and hit the `Add Principal` button on the right  of the screen.

![IAP Backend Service Selection](/images/iap-backend-service-selection.png){: class="screenshot" }

In the Add principals dialog that appears, enter the email addresses of groups or individuals who should have access the the Visulate UI and APIs. Select IAP-secured Web App User in the Role field and hit `Save`

![IAP Authorized Users](/images/iap-principals.png){: class="screenshot" }

## BackendConfig



### Create a Kubernetes secret

Use the client_id and client_secret values from the client_secret JSON file downloaded earlier

```
kubectl create secret generic visulate-iap-secret --namespace=catalog-ns \
    --from-literal=client_id=client_id_key \
    --from-literal=client_secret=client_secret_key
```

### Create a BackendConfig

Use a text editor to create a manifest file

```
vi iap-backend-config.yaml
```

Example:
```
---
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: config-default
  namespace: catalog-ns
spec:
  iap:
    enabled: true
    oauthclientCredentials:
      secretName: visulate-iap-secret
```

Apply the file to your cluster

```
kubectl apply -f iap-backend-config.yaml
```

### Annotate Services

Navigate to the Services & Ingress page under Kubernetes Engine in the GCP console. For each service, hit the `Edit` button at the top of the page to access the YAML Editor. Add a beta.cloud.google.com/backend-config annotation as shown below (note the "config-default" value matches the BackendConfig name in the previous step)

![IAP Service Annotation](/images/iap-service-manifest.png){: class="screenshot" }

Example:
```
metadata:
  annotations:
    beta.cloud.google.com/backend-config: '{"default": "config-default"}'
```

Complete this step for each Service (-api-svc, -sql-svc and -ui-svc)

## Test

Wait for the changes to take effect then open the Visulate UI in a new Incognito window. You should be required to authenticate with your Google credentials.