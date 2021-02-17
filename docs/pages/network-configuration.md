* TOC
{:toc id="toc"}
# Configure your network

Visulate uses [Oracle Instant Client](https://www.oracle.com/database/technologies/instant-client.html) components to connect to each registered database. You may need to modify your firewall rules to support this. Use SQL*Plus to verify your firewall allows connections from the Kubernetes cluster to each database you want to register. This can be done from the API Server pod or by creating a dedicated pod to test connections.

## Create a Cloud VPN if required

Follow the instructions in the [Google Cloud VPN guide](https://cloud.google.com/network-connectivity/docs/vpn/how-to)

## Test connections from the API Server pod

The API Server image includes SQL*Plus. You can use it to verify your firewall rules.

1. Use `kubectl` to find the API Server pod name. Look for the pod with `-api-` in its name:

    ```
    $ kubectl get pods --namespace=test-nat-ns
    NAME                                                            READY   STATUS    RESTARTS   AGE
    test-nat-deployment1-visulate-api-5598f9b558-x75qj   4/4     Running   0          3d21h
    test-nat-deployment1-visulate-ui-6dc459fd65-cqtp9    2/2     Running   0          3d21h
    ```
2. Open a bash shell in the pod:

    ```
    kubectl exec -it test-nat-deployment1-visulate-for-oracle-api-5598f9b558-x75qj \
      --namespace=test-nat-ns -- /bin/bash
    ```
3.  Login to the database using SQL*Plus:

    ```
    Defaulting container name to visulate-for-oracle-api.
    Use 'kubectl describe
    pod/test-nat-deployment1-visulate-for-oracle-api-5598f9b558-x75qj
      -n test-nat-ns' to see all of the containers in this pod.
    bash-4.2# sqlplus visulate@db11.visulate.net:1521/vis13

    SQL*Plus: Release 19.0.0.0.0 - Production on Sat Mar 28 15:46:47 2020
    Version 19.5.0.0.0

    Copyright (c) 1982, 2019, Oracle.  All rights reserved.

    Enter password:

    Connected to:
    Oracle Database 11g Release 11.2.0.4.0 - 64bit Production

    SQL>
```


## Test connections using a dedicated Pod

Alternatively you can use an [oracle/docker-image](https://github.com/oracle/docker-images/tree/master/OracleInstantClient) to create a dedicated pod for testing database connections.

1. Follow the instructions in the [Container Registry quickstart](https://cloud.google.com/container-registry/docs/quickstart) guide
to create a registry for your project if you don't already have one.

2. Use a text editor to create a Dockerfile with the following contents:
    ```
    FROM oraclelinux:7-slim

    ARG release=19
    ARG update=6

    RUN  yum -y install oracle-release-el7 && yum-config-manager --enable ol7_oracle_instantclient && \
        yum -y install oracle-instantclient${release}.${update}-basic \
                oracle-instantclient${release}.${update}-devel \
                oracle-instantclient${release}.${update}-sqlplus && \
        yum -y install iputils && \
        yum -y install nmap && \
        rm -rf /var/cache/yum

    CMD /bin/bash
    ```

3. Build the image and load it to the registry
    ```
    export REGISTRY=gcr.io/$(gcloud config get-value project | tr ':' '/')
    export APP_NAME=visulate-for-oracle

    docker build --tag $REGISTRY/$APP_NAME/oracle-client:latest .
    docker push $REGISTRY/$APP_NAME/oracle-client:latest
    ```

4. Create a pod
    ```
    kubectl run -it  --namespace=test-ns \
    --image=$REGISTRY/$APP_NAME/oracle-client:latest  \
    --generator=run-pod/v1  -- oracle-client
    ```

This will open a bash shell with the Oracle client tools installed:
```
bash-4.2# sqlplus visulate@db227.visulate.net:49161/XE

SQL*Plus: Release 19.0.0.0.0 - Production on Tue May 19 20:02:20 2020
Version 19.6.0.0.0

Copyright (c) 1982, 2019, Oracle.  All rights reserved.


Connected to:
Oracle Database 11g Express Edition Release 11.2.0.2.0 - 64bit Production

SQL> exit
Disconnected from Oracle Database 11g Express Edition Release 11.2.0.2.0 - 64bit Production
```

It also has iputils and nmap installed. These can be useful for diagnosing connection issues.
For example, you can use ping to see if the database host is reachable:
```
bash-4.2# ping db227.visulate.net
PING db227.visulate.net (35.209.19.18) 56(84) bytes of data.
64 bytes from 18.19.209.135.bc.googleusercontent.com (35.209.19.118): icmp_seq=1 ttl=56 time=26.6 ms
64 bytes from 18.19.209.135.bc.googleusercontent.com (35.209.19.118): icmp_seq=2 ttl=56 time=27.0 ms
64 bytes from 18.19.209.135.bc.googleusercontent.com (35.209.19.118): icmp_seq=3 ttl=56 time=26.7 ms
64 bytes from 18.19.209.135.bc.googleusercontent.com (35.209.19.118): icmp_seq=4 ttl=56 time=26.8 ms
64 bytes from 18.19.209.135.bc.googleusercontent.com (35.209.19.118): icmp_seq=5 ttl=56 time=26.9 ms
^C
--- db20.visulate.net ping statistics ---
5 packets transmitted, 5 received, 0% packet loss, time 4005ms
rtt min/avg/max/mdev = 26.625/26.858/27.096/0.237 ms
```

nmap can be used to see if the database port (typically 1521) is open:
```
bash-4.2# nmap db20.visulate.net -sS

Starting Nmap 6.40 ( http://nmap.org ) at 2020-05-19 20:03 UTC
Nmap scan report for db227.visulate.net (35.209.19.118)
Host is up (0.026s latency).
rDNS record for 35.209.19.118: 18.19.209.135.bc.googleusercontent.com
Not shown: 998 filtered ports
PORT      STATE SERVICE
22/tcp    open  ssh
49161/tcp open  unknown

Nmap done: 1 IP address (1 host up) scanned in 25.32 seconds
```

The pod will keep running when you exit the shell. You can keep it around for later use and reconnect using:
```
kubectl attach oracle-client -c oracle-client -i -t --namespace=test-ns
```
or delete using:
```
kubectl delete pod oracle-client --namespace=test-ns
```

## Update firewall rules for the database server

If the SQL*Plus connections fail you may need to update the database server's firewall rules. It must allow requests from the API Server to the database server and port. These requests will originate from the API server deployment's pod. The origin server IP address for these requests will be different from the Ingress IP address used to access the service and may change over time. The firewall rules for the database server will need to reflect this. For example, a rule that opens the database port to the Kubernetes cluster should work as long as it doesn't rely on a static IP address.

![Cluster without egress IP](/images/ingress-egress1.png)

## Create an Egress IP address using NAT

You will need an Egress IP if your database firewall only allows connections from known external IP addresses. This can achieved using network address translation (NAT). Visulate for Oracle has been tested using [Cloud NAT](https://cloud.google.com/nat/docs/overview) to allocate an Egress IP address to the cluster.

![Cluster with egress IP](/images/ingress-egress2.png)
