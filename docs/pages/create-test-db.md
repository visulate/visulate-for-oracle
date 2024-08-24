* TOC
{:toc id="toc"}
# Create an Oracle test database in GCP

Use the Oracle 23 Free docker image to create a test instance on a Compute Engine VM.

## Create a VM

Use the Cloud Console or a gcloud command to create a VM with a 30GB boot disk using Google's Container Optimize OS:

```
gcloud compute instances create vm-oracle23free \
  --project=YOUR_PROJECT_ID \
  --zone=YOUR_ZONE \
  --machine-type=e2-medium \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-ssd \
```

**Note:** this will create a VM with a public IP address. We will use it to simplify the initial setup and then remove it.

## Install Oracle on the VM

1. Use the Cloud Console or `gcloud compute ssh` to ssh into to new VM

2. `docker pull` the container image

    ```
    docker pull container-registry.oracle.com/database/free:latest
    ```

    **Note:** you may need to update firewall rules in the Google VPC to allow access to Oracle's container registry

3. Create an oradata directory

    Create a local file system directory for database files

    ```
    mkdir oradata
    chmod 777 oradata/
    ```

4. Create a database instance.

    Use an environment variable to set the system password and a volume map for the oradata directory

    ```
    sudo docker run -d --name ora23free -p 1521:1521 \
     -e ORACLE_PWD=manager2023free \
     -v $PWD/oradata:/opt/oracle/oradata \
     container-registry.oracle.com/database/free:latest
    ```

5. Run `docker logs ora23free` to monitor the installation

    Wait for the installation to finish:

    ```
    665600K
    Starting Oracle Net Listener.
    Oracle Net Listener started.
    Starting Oracle Database instance FREE.
    Oracle Database instance FREE started.

    The Oracle base remains unchanged with value /opt/oracle
    #########################
    DATABASE IS READY TO USE!
    #########################
    The following output is now a tail of the alert.log:
    2024-08-10T18:19:13.006902+00:00
    PDB$SEED(2):Opening pdb with Resource Manager plan: DEFAULT_PLAN
    (3):--ATTENTION--
    (3):PARALLEL_MAX_SERVERS (with value 1) is insufficient. This may affect transaction recovery performance.
    Modify PARALLEL_MAX_SERVERS parameter to a value > 4 (= parallel servers count computed from parameter FAST_START_PARALLEL_ROLLBACK) in PDB ID 3
    FREEPDB1(3):Autotune of undo retention is turned on.
    2024-08-10T18:19:15.770114+00:00
    FREEPDB1(3):Opening pdb with Resource Manager plan: DEFAULT_PLAN
    Completed: Pluggable database FREEPDB1 opened read write
    Completed: ALTER DATABASE OPEN
    2024-08-10T18:19:19.528616+00:00
    ```

6. Install test schemas

    Download Oracle's sample schemas into  a subdirectory of the oradata directory created earlier and use SQL*Plus to install them.

    ```
    cd oradata/
    git clone https://github.com/oracle-samples/db-sample-schemas.git
    docker exec -it ora23free sqlplus system@freepdb1

    SQL> @/opt/oracle/oradata/db-sample-schemas/human_resources/hr_install.sql

    docker exec -it ora23free sqlplus system@freepdb1

    SQL> @/opt/oracle/oradata/db-sample-schemas/customer_orders/co_install.sql
    ```

    **Note:** the install scripts have an exit statement which will log you out of SQL*Plus

## Create a Visulate account

1. Login to SQL*Plus as system

    ```
    docker exec -it ora23free sqlplus system@freepdb1
    ```

2. Create a database user

    ```
    create user visulate identified by &password;
    alter user visulate account unlock;
    grant create session to visulate;
    grant select any dictionary to visulate;
    grant select_catalog_role to visulate;
    ```

    **Note:** see the [Database Setup](/pages/database-setup.html) for additional details.

## Network Updates

1. Remove the public ip address from the VM
2. Configure a [firewall rule](https://cloud.google.com/network-connectivity/docs/vpn/how-to/configuring-firewall-rules) to allow ingress to the VM on port 1521