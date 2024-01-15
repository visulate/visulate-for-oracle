* TOC
{:toc id="toc"}
# Updating Visulate for Oracle

This page describes the process to update a live instance of Visulate for Oracle when a new version is released.

## Overview

The upgrade process is relatively simple. You need to provision an instance with the latest version of the code, configure and test it then shut down the old instance. Additional steps are required to perform a seamless transition with zero downtime. This can be achieved using load balancer forwarding and a DNS update.

## Provision a new instance

Follow the steps described in the [quickstart guide](/pages/quickstart.html) to provision a new Visulate instance.

## Configure the instance

Re-use the [database registration](/pages/database-registration.html#apply-a-new-kubernetes-secret)
and [SQL endpoints](/pages/query-engine-config.html#apply-the-endpointsjson-file-as-a-new-kubernetes-secret)
secrets from your current instance. Follow the steps in the [TLS certification guide](/pages/tls-cert.html) if required.

**Tip:** Review the [troubleshooting guide](/pages/troubleshooting.html#lost-database-registration-file) if you've lost your database registration file

## Test the new instance

Follow the steps in the [review section](/pages/quickstart.html#review-your-database-and-its-data-model) of the setup guide to verify the core functionality is working correctly. Review the readme for the new release. Test any new features described in it.

## Go-live

The new instance is ready to go live if the tests are successful. The exact process for going live depends on your environment. For example, a small team using Visulate to document a development environment may simply shutdown the old instance and switch over to the new one. A large organization running 24/7 operations may require a seamless transition to the new version with zero downtime.

The following steps describe one option for doing this. It creates a new IP address and forwarding rule in the load balancer then updates a DNS A record to point at it.

### Add a new IP address and forwarding rule to the load balancer

Use the GCP Console (Network services -> Load balancing) to find the load balancer that was created to support the ingress for the new version:

![load balancer list](/images/load-balancer-list.png){: class="screenshot" tabindex="0" }

Click on the entry to open it then press the `Edit` button. Select `Frontend configuration` on the Edit HTTP(S) load balancer screen:

![edit load balancer](/images/edit-load-balancer.png){: class="screenshot" tabindex="0" }

Click on the button marked `+ Add Frontend IP and port` in the Frontend configuration region

![add frontend ip address](/images/add-frontend-ip.png){: class="screenshot" }

Select or create an IP address along with a certificate for the domain you intend to use. **Tip:** reuse the certificate from the current/old instance if you intend to use the same domain.

Press the `Done` button in the Frontend region followed by the `Update` button. Wait a few minutes for the configuration to update.

### Use cURL to test the forwarding rule

Use cURL with the -v (verbose) and --resolve options as shown in the example below. Check the TLS certificate details and response content are as expected.

```
curl -v https://demo.visulate.net/api/ --resolve "demo.visulate.net:443:35.190.44.73"
* Added demo.visulate.net:443:35.190.44.73 to DNS cache
* Hostname demo.visulate.net was found in DNS cache
*   Trying 35.190.44.73:443...
* TCP_NODELAY set
* Connected to demo.visulate.net (35.190.44.73) port 443 (#0)
* ALPN, offering h2
* ALPN, offering http/1.1
* successfully set certificate verify locations:
*   CAfile: /etc/ssl/certs/ca-certificates.crt
  CApath: /etc/ssl/certs
* TLSv1.3 (OUT), TLS handshake, Client hello (1):
* TLSv1.3 (IN), TLS handshake, Server hello (2):
* TLSv1.3 (IN), TLS handshake, Encrypted Extensions (8):
* TLSv1.3 (IN), TLS handshake, Certificate (11):
* TLSv1.3 (IN), TLS handshake, CERT verify (15):
* TLSv1.3 (IN), TLS handshake, Finished (20):
* TLSv1.3 (OUT), TLS change cipher, Change cipher spec (1):
* TLSv1.3 (OUT), TLS handshake, Finished (20):
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* ALPN, server accepted to use h2
* Server certificate:
*  subject: CN=demo.visulate.net
*  start date: May 21 13:24:21 2020 GMT
*  expire date: Aug 19 13:24:21 2020 GMT
*  subjectAltName: host "demo.visulate.net" matched cert's "demo.visulate.net"
*  issuer: C=US; O=Google Trust Services; CN=GTS CA 1D2
*  SSL certificate verify ok.
* Using HTTP2, server supports multi-use
* Connection state changed (HTTP/2 confirmed)
* Copying HTTP/2 data in stream buffer to connection buffer after upgrade: len=0
* Using Stream ID: 1 (easy handle 0x564e66bd0db0)
> GET /api/ HTTP/2
> Host: demo.visulate.net
> user-agent: curl/7.68.0
> accept: */*
>
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* old SSL session ID is stale, removing
* Connection state changed (MAX_CONCURRENT_STREAMS == 100)!
< HTTP/2 200
< x-powered-by: Express
< content-type: application/json; charset=utf-8
< content-length: 1969
< etag: W/"7b1-+vn4VgMGOiwFJvCqFdUiR6hHwYw"
< date: Wed, 27 May 2020 20:55:04 GMT
< via: 1.1 google
< alt-svc: clear
<
{"endpoints":[{"endpoint":"vis13","description":"Visulate test instance","connectString":
 ...
}]}
```

### Test the browser UI locally

Update the "/etc/hosts" file (or "c:\Windows\System32\Drivers\etc\hosts") on your laptop. Add an entry for your domain name resolving to the new IP address. Test the UI using https and verify the TLS certificate is valid.

**Tip:** Don't forget to remove the entry after testing.

### Update the DNS Entry

Create an "A" record for the IP address and wait for the DNS record to propagate (e.g. check using nslookup, dig or a web based tool like [dnschecker.org](https://dnschecker.org/))

Test the API and UI and verify its behavior.

Leave the old instance running for a couple of days if it is running on the public internet. This will allow time for root name servers and cache records across the entire web to be updated.

## Remove the old instance
Delete the IP address and forwarding rule from the old load balancer (Network services -> Load balancing) then delete the old instance. Navigate to the Applications screen (Kubernetes Engine -> Applications), select the checkbox associated with the old instance then press the `DELETE` button.

## Cleanup network resources

Use the GCP Console to review the list of load balancers (Network services -> Load balancing) and external IP addresses (VPC network -> External IP addresses). You may need to delete some resources manually. Orphaned resources may appear if the combined length of the namespace and application name of the old instance exceeded 32 characters see [GCP Marketplace Tools issue 495](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/issues/495). They can also occur if the load balancer that supports the ingress was edited directly. Adding a new IP address and forwarding rule (described above) would be an example of this.