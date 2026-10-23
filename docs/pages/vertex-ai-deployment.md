* TOC
{:toc id="toc"}

# Deploying Visulate with Google Cloud Vertex AI & Identity-Aware Proxy (IAP)

This guide walks through configuring Visulate for Oracle with **Google Cloud Vertex AI** and **Identity-Aware Proxy (IAP)** on a Google Compute Engine (GCE) Virtual Machine.

---

## 1. Overview & Architecture

### Why Vertex AI with IAM in Assured Workloads?
While development and evaluation environments typically use lightweight **Google AI Studio API Keys** (`GOOGLE_AI_KEY`), enterprise and regulated environments—such as **Google Cloud Assured Workloads** (FedRAMP, CJIS, DoD Impact Levels, HIPAA, or EU Sovereign Controls)—require enterprise governance:

1. **Security & Boundary Compliance**: Vertex AI calls run against regional endpoints (`https://{LOCATION}-aiplatform.googleapis.com`) within the customer's Google Cloud compliance boundary rather than consumer endpoints (`generativelanguage.googleapis.com`).
2. **Data Residency**: Assured Workloads organizational policies (`constraints/gcp.resourceLocations`) enforce strict regional data residency (e.g. `us-central1`, `us-east4`).
3. **No Static Keys**: Organizational policies frequently prohibit long-lived API keys (`constraints/iam.disableServiceAccountApiKeyCreation`). Visulate leverages **IAM Service Account authentication** through Application Default Credentials (ADC) and the GCE metadata server, eliminating hardcoded keys.
4. **Dedicated Service Account (Least Privilege)**: Instead of using the default Compute Engine service account (which has broad project permissions), Visulate should be attached to a **dedicated service account** scoped strictly with `roles/aiplatform.user`.
5. **Zero-Trust Access with IAP**: The Visulate VM has **no external public IP address**. All inbound browser and API traffic is authenticated and authorized via **Identity-Aware Proxy (IAP)** on a Google Cloud External Application Load Balancer.

### Architecture Diagram

```
+---------------------------------------------------------------------------------+
|                               Google Cloud VPC                                  |
|                                                                                 |
|  [ User Browser ]                                                               |
|        |                                                                        |
|        v (HTTPS:443 with Google-managed Certificate)                            |
|  [ Cloud External Application Load Balancer ]                                   |
|        | (Session Affinity: GENERATED_COOKIE)                                   |
|        v                                                                        |
|  [ Identity-Aware Proxy (IAP) ]  <--- Google Identity / IAM Group Policy        |
|        |                                                                        |
|        v (Port 80)                                                              |
|  [ Zonal Network Endpoint Group (NEG) ]                                         |
|        |                                                                        |
|        v (Internal VPC IP: 10.0.1.x)                                            |
|  +---------------------------------------------------------------------------+  |
|  | Visulate Compute Engine VM (Private IP only)                              |  |
|  | Dedicated Service Account: visulate-app-sa@<project>.iam.gserviceaccount.com  |
|  |                                                                           |  |
|  |  +-------------------+  +-------------------+  +-----------------------+  |  |
|  |  | reverseproxy (80) |->|   visui & visapi  |->|  ai-agent (10000)     |  |  |
|  |  +-------------------+  +-------------------+  +-----------------------+  |  |
|  +-----------------------------------------------------------|---------------+  |
|                                                              |                  |
|                                     (Metadata Server ADC)    v                  |
|                                                    [ Cloud NAT / Private Access ]
+--------------------------------------------------------------|------------------+
                                                               v
                                                 [ Vertex AI APIs (Regional) ]
                                                 https://us-central1-aiplatform.googleapis.com
```

---

## 2. Visulate Configuration Settings

Visulate automatically activates Vertex AI mode when the following environment variables are present in `/home/visulate/.env`:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `GOOGLE_GENAI_USE_VERTEXAI` | Tells the Google GenAI SDK and ADK to target Vertex AI instead of Google AI Studio. | `true` |
| `GOOGLE_CLOUD_PROJECT` | The Google Cloud Project ID where Vertex AI is enabled. | `my-assured-project-id` |
| `GOOGLE_CLOUD_LOCATION` | The region where model inference runs. Must match the Assured Workload boundary. | `us-central1` or `us-east4` |
| `GOOGLE_APPLICATION_CREDENTIALS` | *(Optional)* Path to a service account JSON file if running outside GCP. On GCE, leave unset so ADC automatically discovers the VM service account via the metadata server. | *(Unset)* |

When `GOOGLE_GENAI_USE_VERTEXAI=true` is set:
- The AI Agent container automatically acquires short-lived OAuth 2.0 access tokens from the GCE metadata server (`http://169.254.169.254`).
- No `GOOGLE_AI_KEY` or `GOOGLE_API_KEY` is required.
- The Visulate API Server (`visapi`) verifies connectivity to the AI Agent directly.

---

## 3. Step-by-Step Deployment using `gcloud` CLI

### Step 1: Set Environment Variables
```bash
export PROJECT_ID="my-assured-project"
export REGION="us-central1"
export ZONE="us-central1-a"
export VPC_NAME="visulate-vpc"
export SUBNET_NAME="visulate-subnet"
export VM_NAME="visulate-vm"
export SA_NAME="visulate-app-sa"
export DOMAIN="visulate.example.com"

gcloud config set project ${PROJECT_ID}
```

### Step 2: Enable Required APIs
```bash
gcloud services enable \
    compute.googleapis.com \
    aiplatform.googleapis.com \
    iap.googleapis.com \
    secretmanager.googleapis.com
```

### Step 3: Create Dedicated Service Account & Grant IAM Roles
Create a dedicated service account and grant it the minimum required roles:
```bash
# 1. Create the dedicated service account
gcloud iam service-accounts create ${SA_NAME} \
    --display-name="Visulate Application Service Account"

export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# 2. Grant Vertex AI User role for model inference
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/aiplatform.user"

# 3. Grant basic monitoring/logging (recommended for Assured Workloads auditing)
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/logging.logWriter"

# 4. (Optional) Grant Secret Manager access if storing database credentials in GCP
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
```

### Step 4: Create VPC, Subnet, and Cloud NAT (Private VM)
For security, the VM should not have a public IP address. Enable **Private Google Access** on the subnet so the VM can reach Google APIs directly:
```bash
# 1. Create VPC network
gcloud compute networks create ${VPC_NAME} --subnet-mode=custom

# 2. Create subnet with Private Google Access enabled
gcloud compute networks subnets create ${SUBNET_NAME} \
    --network=${VPC_NAME} \
    --region=${REGION} \
    --range=10.0.1.0/24 \
    --enable-private-ip-google-access

# 3. Create Cloud Router & NAT (for outbound container pulls / OS packages)
gcloud compute routers create visulate-router \
    --network=${VPC_NAME} \
    --region=${REGION}

gcloud compute routers nats create visulate-nat \
    --router=visulate-router \
    --region=${REGION} \
    --auto-allocate-nat-external-ips \
    --nat-all-subnet-ip-ranges
```

### Step 5: Configure Firewall Rules
Allow Load Balancer health checks and IAP SSH access:
```bash
# Allow GCP Health Checkers & Load Balancer ingress
gcloud compute firewall-rules create allow-glbc-and-health-checks \
    --network=${VPC_NAME} \
    --action=ALLOW \
    --direction=INGRESS \
    --source-ranges=130.211.0.0/22,35.191.0.0/16 \
    --rules=tcp:80 \
    --target-tags=visulate-server

# Allow IAP Tunneling for SSH management
gcloud compute firewall-rules create allow-iap-ssh \
    --network=${VPC_NAME} \
    --action=ALLOW \
    --direction=INGRESS \
    --source-ranges=35.235.240.0/20 \
    --rules=tcp:22 \
    --target-tags=visulate-server
```

### Step 6: Deploy and Bootstrap the Visulate VM
Deploy the VM with the dedicated service account and no external IP. 

To ensure Visulate starts automatically and responds on port 80 for the load balancer health check, pass a startup script that installs Docker, configures the services, and runs `docker compose`:

```bash
# Create local bootstrap startup script
cat << 'BOOTSTRAP' > startup.sh
#!/bin/bash
set -e

# 1. Install Docker & Compose plugin
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

# 2. Create Visulate directory structure
mkdir -p /home/visulate/config /home/visulate/downloads /home/visulate/repos /home/visulate/wallet
chmod -R 777 /home/visulate/downloads /home/visulate/repos

# 3. Create default database configuration files
cat << 'EOF' > /home/visulate/config/database.js
const endpoints = [];
module.exports.endpoints = endpoints;
EOF

cat << 'EOF' > /home/visulate/config/endpoints.json
{}
EOF

# 4. Create docker-compose.yaml
IMAGE_REPO="gcr.io/visulate-llc-public"
VERSION="3.0"

cat << EOF > /home/visulate/docker-compose.yaml
version: "3.8"
services:
  reverseproxy:
    image: \${IMAGE_REPO}/visulate-for-oracle/proxy:\${VERSION}
    container_name: reverseproxy
    ports:
      - 80:80
    networks:
      - visulate_network

  visapi:
    image: \${IMAGE_REPO}/visulate-for-oracle:\${VERSION}
    container_name: visapi
    hostname: visapi
    depends_on:
      - reverseproxy
    expose:
      - "3000"
    volumes:
      - /home/visulate/config:/visulate-server/config
      - /home/visulate/downloads:/visulate-server/downloads
      - /home/visulate/repos:/app/repos
    environment:
      - GOOGLE_GENAI_USE_VERTEXAI=\${GOOGLE_GENAI_USE_VERTEXAI:-false}
      - GOOGLE_CLOUD_PROJECT=\${GOOGLE_CLOUD_PROJECT}
      - GOOGLE_CLOUD_LOCATION=\${GOOGLE_CLOUD_LOCATION:-us-central1}
      - CORS_ORIGIN_WHITELIST=\${CORS_ORIGIN_WHITELIST}
      - VISULATE_AGENT_URL=http://ai-agent:10000/agent/generate
    networks:
      - visulate_network

  visui:
    image: \${IMAGE_REPO}/visulate-for-oracle/ui:\${VERSION}
    container_name: visui
    hostname: visui
    depends_on:
      - reverseproxy
    expose:
      - "80"
    networks:
      - visulate_network

  vissql:
    image: \${IMAGE_REPO}/visulate-for-oracle/sql:\${VERSION}
    container_name: vissql
    hostname: vissql
    depends_on:
      - reverseproxy
    expose:
      - "5000"
    volumes:
      - /home/visulate/config:/query-engine/sql2csv/config
    networks:
      - visulate_network

  ai-agent:
    image: \${IMAGE_REPO}/visulate-for-oracle/ai-agent:\${VERSION}
    container_name: ai-agent
    hostname: ai-agent
    depends_on:
      - reverseproxy
      - vissql
      - visapi
    expose:
      - "10000-10010"
    volumes:
      - /home/visulate/downloads:/app/downloads
      - /home/visulate/repos:/app/repos
    environment:
      - GOOGLE_GENAI_USE_VERTEXAI=\${GOOGLE_GENAI_USE_VERTEXAI:-false}
      - GOOGLE_CLOUD_PROJECT=\${GOOGLE_CLOUD_PROJECT}
      - GOOGLE_CLOUD_LOCATION=\${GOOGLE_CLOUD_LOCATION:-us-central1}
      - VISULATE_BASE=http://reverseproxy
    networks:
      - visulate_network

networks:
  visulate_network:
EOF

# 5. Start Visulate
cd /home/visulate
docker compose up -d
BOOTSTRAP

# Create VM with attached bootstrap startup script
gcloud compute instances create ${VM_NAME} \
    --zone=${ZONE} \
    --machine-type=e2-standard-4 \
    --subnet=${SUBNET_NAME} \
    --no-address \
    --tags=visulate-server \
    --service-account=${SA_EMAIL} \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=50GB \
    --metadata-from-file=startup-script=startup.sh
```

### Step 7: Configure Vertex AI on the VM
Connect to the VM via IAP SSH:
```bash
gcloud compute ssh ${VM_NAME} --zone=${ZONE} --tunnel-through-iap
```

In the interactive SSH session, export the project and location chosen in Step 1, write them to `/home/visulate/.env`, and recreate the containers:
```bash
# Define variables inside the remote SSH session
export PROJECT_ID="my-assured-project"
export REGION="us-central1"

sudo tee -a /home/visulate/.env << EOF
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=${PROJECT_ID}
GOOGLE_CLOUD_LOCATION=${REGION}
EOF

# Recreate containers to apply the updated environment variables
cd /home/visulate
sudo docker compose up -d --force-recreate ai-agent visapi
```

### Step 8: Set Up Cloud Load Balancer with IAP

1. **Create a Zonal Network Endpoint Group (NEG) for the VM**:
   ```bash
   gcloud compute network-endpoint-groups create visulate-neg \
       --network-endpoint-type=GCE_VM_IP_PORT \
       --zone=${ZONE} \
       --network=${VPC_NAME} \
       --subnet=${SUBNET_NAME}

   gcloud compute network-endpoint-groups update visulate-neg \
       --zone=${ZONE} \
       --add-endpoint="instance=${VM_NAME},port=80"
   ```

2. **Create Health Check & Backend Service**:
   ```bash
   # Health check targets the reverseproxy / healthz endpoint
   gcloud compute health-checks create http visulate-health-check \
       --port=80 \
       --request-path=/healthz

   # Create backend service with session affinity and CDN disabled (required for IAP)
   gcloud compute backend-services create visulate-backend-service \
       --load-balancing-scheme=EXTERNAL \
       --protocol=HTTP \
       --health-checks=visulate-health-check \
       --session-affinity=GENERATED_COOKIE \
       --affinity-cookie-ttl=86400 \
       --global \
       --no-enable-cdn

   # Add the Zonal NEG backend with RATE balancing mode
   gcloud compute backend-services add-backend visulate-backend-service \
       --network-endpoint-group=visulate-neg \
       --network-endpoint-group-zone=${ZONE} \
       --balancing-mode=RATE \
       --max-rate-per-endpoint=100 \
       --global
   ```

3. **Configure OAuth Credentials for IAP**:
   - In the Google Cloud Console, navigate to **APIs & Services > Credentials**.
   - Create an **OAuth 2.0 Client ID** of type **Web application**.
   - Set the Authorized Redirect URI to:
     `https://iap.googleapis.com/v1/oauth/clientIds/YOUR_CLIENT_ID:handleRedirect`

4. **Enable IAP on the Backend Service**:
   ```bash
   gcloud compute backend-services update visulate-backend-service \
       --global \
       --iap=enabled,oauth2-client-id=YOUR_CLIENT_ID,oauth2-client-secret=YOUR_CLIENT_SECRET
   ```

5. **Provision Google-managed SSL Certificate and Forwarding Rule**:
   ```bash
   # Create a Google-managed SSL certificate
   gcloud compute ssl-certificates create visulate-ssl-cert \
       --domains=${DOMAIN} \
       --global

   # Create URL Map
   gcloud compute url-maps create visulate-url-map \
       --default-service=visulate-backend-service

   # Create HTTPS Target Proxy
   gcloud compute target-https-proxies create visulate-https-proxy \
       --url-map=visulate-url-map \
       --ssl-certificates=visulate-ssl-cert

   # Create Global Static IP and Forwarding Rule
   gcloud compute addresses create visulate-lb-ip --global

   export LB_IP=$(gcloud compute addresses describe visulate-lb-ip --global --format='value(address)')

   gcloud compute forwarding-rules create visulate-https-rule \
       --load-balancing-scheme=EXTERNAL \
       --network-tier=PREMIUM \
       --address=${LB_IP} \
       --ports=443 \
       --target-https-proxy=visulate-https-proxy \
       --global

   echo "Point your DNS A-Record for ${DOMAIN} to: ${LB_IP}"
   ```

6. **Grant IAP User Access**:
   Grant authorized users access to the application:
   ```bash
   gcloud iap web add-iam-policy-binding \
       --resource-type=backend-services \
       --service=visulate-backend-service \
       --member="user:engineer@example.com" \
       --role="roles/iap.httpsResourceAccessor"
   ```

---

## 4. Infrastructure as Code (Terraform)

Below is a complete Terraform module deploying the secure architecture with a dedicated service account, Vertex AI permissions, VM bootstrap, and Identity-Aware Proxy.

### `main.tf`

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 1. Enable Required Services
resource "google_project_service" "services" {
  for_each = toset([
    "compute.googleapis.com",
    "aiplatform.googleapis.com",
    "iap.googleapis.com",
    "secretmanager.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# 2. Dedicated Service Account for Visulate VM
resource "google_service_account" "visulate_sa" {
  account_id   = "visulate-app-sa"
  display_name = "Visulate Application Dedicated Service Account"
  depends_on   = [google_project_service.services]
}

# Grant Vertex AI User role
resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.visulate_sa.email}"
}

# Grant Cloud Logging Writer role
resource "google_project_iam_member" "logging_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.visulate_sa.email}"
}

# 3. VPC Network & Subnet with Private Google Access
resource "google_compute_network" "vpc" {
  name                    = "visulate-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name                     = "visulate-subnet"
  ip_cidr_range            = "10.0.1.0/24"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true
}

# 4. Cloud Router & NAT (Outbound access for updates and container pulls)
resource "google_compute_router" "router" {
  name    = "visulate-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "visulate-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# 5. Firewall Rules
resource "google_compute_firewall" "allow_health_checks" {
  name    = "allow-health-checks"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["visulate-node"]
}

resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "allow-iap-ssh"
  network = google_compute_network.vpc.id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["visulate-node"]
}

# 6. Compute Engine Instance with Visulate Bootstrap
resource "google_compute_instance" "visulate_vm" {
  name         = "visulate-vm"
  machine_type = "e2-standard-4"
  zone         = "${var.region}-a"
  tags         = ["visulate-node"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 50
    }
  }

  network_interface {
    network    = google_compute_network.vpc.id
    subnetwork = google_compute_subnetwork.subnet.id
    # No external public IP - private access only
  }

  service_account {
    email  = google_service_account.visulate_sa.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    set -e

    # 1. Install Docker & Compose plugin
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker

    # 2. Directory structure
    mkdir -p /home/visulate/config /home/visulate/downloads /home/visulate/repos /home/visulate/wallet
    chmod -R 777 /home/visulate/downloads /home/visulate/repos

    cat << 'CFG' > /home/visulate/config/database.js
    const endpoints = [];
    module.exports.endpoints = endpoints;
    CFG

    cat << 'CFG' > /home/visulate/config/endpoints.json
    {}
    CFG

    # 3. Environment settings
    cat << ENV > /home/visulate/.env
    GOOGLE_GENAI_USE_VERTEXAI=true
    GOOGLE_CLOUD_PROJECT=${var.project_id}
    GOOGLE_CLOUD_LOCATION=${var.region}
    ENV

    # 4. Compose stack
    cat << 'COMPOSE' > /home/visulate/docker-compose.yaml
    version: "3.8"
    services:
      reverseproxy:
        image: gcr.io/visulate-llc-public/visulate-for-oracle/proxy:3.0
        ports:
          - 80:80
        networks:
          - visulate_net

      visapi:
        image: gcr.io/visulate-llc-public/visulate-for-oracle:3.0
        depends_on:
          - reverseproxy
        volumes:
          - /home/visulate/config:/visulate-server/config
          - /home/visulate/downloads:/visulate-server/downloads
          - /home/visulate/repos:/app/repos
        environment:
          - GOOGLE_GENAI_USE_VERTEXAI=true
          - GOOGLE_CLOUD_PROJECT=${var.project_id}
          - GOOGLE_CLOUD_LOCATION=${var.region}
          - VISULATE_AGENT_URL=http://ai-agent:10000/agent/generate
        networks:
          - visulate_net

      visui:
        image: gcr.io/visulate-llc-public/visulate-for-oracle/ui:3.0
        depends_on:
          - reverseproxy
        networks:
          - visulate_net

      vissql:
        image: gcr.io/visulate-llc-public/visulate-for-oracle/sql:3.0
        depends_on:
          - reverseproxy
        volumes:
          - /home/visulate/config:/query-engine/sql2csv/config
        networks:
          - visulate_net

      ai-agent:
        image: gcr.io/visulate-llc-public/visulate-for-oracle/ai-agent:3.0
        depends_on:
          - reverseproxy
          - vissql
          - visapi
        volumes:
          - /home/visulate/downloads:/app/downloads
          - /home/visulate/repos:/app/repos
        environment:
          - GOOGLE_GENAI_USE_VERTEXAI=true
          - GOOGLE_CLOUD_PROJECT=${var.project_id}
          - GOOGLE_CLOUD_LOCATION=${var.region}
          - VISULATE_BASE=http://reverseproxy
        networks:
          - visulate_net

    networks:
      visulate_net:
    COMPOSE

    cd /home/visulate
    docker compose up -d
  EOT
}

# 7. Zonal Network Endpoint Group (NEG)
resource "google_compute_network_endpoint_group" "visulate_neg" {
  name                  = "visulate-neg"
  network               = google_compute_network.vpc.id
  subnetwork            = google_compute_subnetwork.subnet.id
  default_port          = "80"
  zone                  = "${var.region}-a"
  network_endpoint_type = "GCE_VM_IP_PORT"
}

resource "google_compute_network_endpoint" "visulate_endpoint" {
  network_endpoint_group = google_compute_network_endpoint_group.visulate_neg.name
  instance               = google_compute_instance.visulate_vm.name
  port                   = 80
  ip_address             = google_compute_instance.visulate_vm.network_interface[0].network_ip
  zone                   = "${var.region}-a"
}

# 8. Load Balancer with IAP
resource "google_compute_health_check" "http" {
  name               = "visulate-http-health-check"
  check_interval_sec = 10
  timeout_sec        = 5

  http_health_check {
    port         = 80
    request_path = "/healthz"
  }
}

resource "google_compute_backend_service" "visulate_backend" {
  name                  = "visulate-backend-service"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 60
  enable_cdn            = false
  health_checks         = [google_compute_health_check.http.id]
  load_balancing_scheme = "EXTERNAL"
  session_affinity      = "GENERATED_COOKIE"
  affinity_cookie_ttl_sec = 86400

  backend {
    group                 = google_compute_network_endpoint_group.visulate_neg.id
    balancing_mode        = "RATE"
    max_rate_per_endpoint = 100
  }

  iap {
    oauth2_client_id     = var.iap_client_id
    oauth2_client_secret = var.iap_client_secret
  }
}

resource "google_compute_managed_ssl_certificate" "ssl_cert" {
  name = "visulate-managed-cert"

  managed {
    domains = [var.domain_name]
  }
}

resource "google_compute_url_map" "url_map" {
  name            = "visulate-url-map"
  default_service = google_compute_backend_service.visulate_backend.id
}

resource "google_compute_target_https_proxy" "https_proxy" {
  name             = "visulate-https-proxy"
  url_map          = google_compute_url_map.url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.ssl_cert.id]
}

resource "google_compute_global_address" "lb_ip" {
  name = "visulate-lb-ip"
}

resource "google_compute_global_forwarding_rule" "https_forwarding_rule" {
  name                  = "visulate-https-rule"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "443"
  target                = google_compute_target_https_proxy.https_proxy.id
  ip_address            = google_compute_global_address.lb_ip.id
}

# 9. IAP Authorized Users
resource "google_iap_web_backend_service_iam_member" "iap_users" {
  for_each               = toset(var.iap_authorized_users)
  project                = var.project_id
  web_backend_service    = google_compute_backend_service.visulate_backend.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
}
```

### `variables.tf`

```hcl
variable "project_id" {
  description = "Google Cloud Project ID (e.g. Assured Workloads project)"
  type        = string
}

variable "region" {
  description = "Target GCP region (e.g. us-central1)"
  type        = string
  default     = "us-central1"
}

variable "domain_name" {
  description = "Fully qualified domain name for Visulate (e.g. visulate.mycompany.com)"
  type        = string
}

variable "iap_client_id" {
  description = "OAuth 2.0 Client ID for Identity-Aware Proxy"
  type        = string
}

variable "iap_client_secret" {
  description = "OAuth 2.0 Client Secret for Identity-Aware Proxy"
  type        = string
  sensitive   = true
}

variable "iap_authorized_users" {
  description = "List of users or groups authorized to access Visulate via IAP"
  type        = list(string)
  default     = ["group:dbas@mycompany.com"]
}
```

---

## 5. Verification & Troubleshooting

### 1. Verify Service Account Token Acquisition
Log in to the VM and test that the Compute Engine metadata server provides access tokens for the dedicated service account:
```bash
curl -s -H "Metadata-Flavor: Google" \
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email"
# Expected output: visulate-app-sa@<PROJECT_ID>.iam.gserviceaccount.com
```

### 2. Check AI Agent Logs
Verify that the `ai-agent` container starts in Vertex AI mode:
```bash
docker-compose logs -f ai-agent
```
You should see:
```text
Root Agent: http://localhost:10000
Agents started:
- Root Agent: http://localhost:10000
- NL2SQL Agent: http://localhost:10001
...
```

### 3. Test Agent Health Check
From within the VM:
```bash
curl -s http://localhost:10000/agent/health
# Expected: {"status":"ok","agent":"root_agent"}
```

### 4. Verify Assured Workloads Data Residency
Ensure `GOOGLE_CLOUD_LOCATION` in `/home/visulate/.env` is set to an allowed region. If your Assured Workloads policy requires `us-central1` and `GOOGLE_CLOUD_LOCATION` is set to an unapproved region, calls to `aiplatform.googleapis.com` will fail with an Organization Policy violation error:
```text
google.api_core.exceptions.FailedPrecondition: 400 Location not allowed by organization policy constraints/gcp.resourceLocations
```
Adjust `GOOGLE_CLOUD_LOCATION` in `/home/visulate/.env` and recreate the affected containers to apply the updated environment:
```bash
sudo docker compose up -d --force-recreate ai-agent visapi
```

---

## 6. Multi-Instance Load Balancing & High Availability

If scaling Visulate across multiple VM instances behind the Cloud Load Balancer, consider the following operational requirements:

### 1. Session Affinity (`GENERATED_COOKIE`)
Visulate maintains conversational and security state locally on each instance:
- **AI Agent Sessions (`sessions.db`)**: Google ADK uses `DatabaseSessionService` backed by a local SQLite database (`sessions.db`) inside the `ai-agent` container to preserve conversation history, multi-turn reasoning, and task resumption markers across requests.
- **SQL Query Engine Credentials**: The `vissql` container issues temporary, in-memory credential tokens tied to the browser's `session_id`. If a subsequent query routes to a different VM, the token will not be found in memory.

**Requirement**: Configure **Cookie-based Session Affinity** on the Cloud Load Balancer backend service:
```hcl
session_affinity        = "GENERATED_COOKIE"
affinity_cookie_ttl_sec = 86400 # 1 day
```
This sets a `GCLB` cookie in the client browser, pinning all subsequent requests from that user to the same VM instance.

### 2. Database Connection Pools
Each Visulate instance runs an independent connection pool manager via `node-oracledb` in `visapi` and `vissql`:
- **Identical Configuration**: `/home/visulate/config/database.js`, `/home/visulate/config/endpoints.json`, and `/home/visulate/wallet` must be identical across all VMs.
- **Listener & Database Sizing**: Each instance opens its own connection pool to registered databases. If a database endpoint specifies `poolMax: 10`, deploying 3 load-balanced Visulate VMs will consume up to 30 simultaneous database connections. Ensure your Oracle / PostgreSQL listener and `PROCESSES` parameter can accommodate `(number of instances) * poolMax`.

### 3. Shared Workspace Filesystem (Filestore)
In single-instance deployments, user repositories and generated files reside in `/home/visulate/repos` and `/home/visulate/downloads`. In a multi-instance topology where users might establish new sessions across different VMs, mount a shared NFS volume (such as **Google Cloud Filestore**) at `/home/visulate/repos` and `/home/visulate/downloads` on each VM so cloned repositories, OKF architectural memories, and generated DDL/CSV artifacts remain accessible regardless of which instance serves the session.
