* TOC
{:toc id="toc"}

# Network and Security Configuration

This guide covers network connectivity, firewall configuration, and implementing enterprise security features like Identity-Aware Proxy (IAP) and TLS certificates.

---

## Network Connectivity
Visulate uses the Oracle Instant Client to connect to registered databases. Ensure your network allows traffic from the Visulate VM to your database servers.

### Firewall Configuration
You must open the database listener port (typically `1521`, or `1522`) on your database server's firewall to allow incoming connections from the Visulate VM's internal or external IP address.

### Egress IP and NAT
If your database firewall only allows connections from known external IP addresses, you may need a static Egress IP.
- **VM with Public IP**: Use the VM's static external IP.
- **Private VM**: Use [Cloud NAT](https://cloud.google.com/nat/docs/overview) to allocate a static Egress IP address to the VPC subnetwork where the Visulate VM resides.

---

## Testing Connections
Before registering a database in the UI, verify connectivity from the Visulate VM using SQL*Plus.

1. **SSH into the Visulate VM**.
2. **Run SQL*Plus inside the API container**:
   The `visapi` container includes the Oracle Instant Client and SQL*Plus.
   ```bash
   docker exec -it visapi sqlplus visulate@db_host:1521/service_name
   ```
3. **Internal Troubleshooting**:
   If SQL*Plus fails, use `nmap` (if installed) or `curl` to check if the port is reachable:
   ```bash
   # Check if the port is open
   nc -zv db_host 1521
   ```

---

## Identity-Aware Proxy (IAP)
IAP allows you to manage access to Visulate using Google Cloud identities without a traditional VPN.

### Prerequisites
- A registered domain name pointing to a Global External Application Load Balancer.
- The Visulate VM must be added to a **Zonal Network Endpoint Group (NEG)**.

### Setup Steps
1. **Create a Zonal NEG**:
   ```bash
   gcloud compute network-endpoint-groups create visulate-neg \
       --network-endpoint-type=GCE_VM_IP_PORT \
       --zone=YOUR_ZONE \
       --network=YOUR_NETWORK
   
   gcloud compute network-endpoint-groups update visulate-neg \
       --zone=YOUR_ZONE \
       --add-endpoint="instance=YOUR_VM_NAME,port=80"
   ```
2. **Configure Load Balancer**:
   - Create a Global External Application Load Balancer.
   - Set the `visulate-neg` as the backend service.
   - **Important**: Disable CDN for the backend service.
3. **Configure OAuth Consent & Credentials**:
   - Set up an Internal OAuth consent screen in the Google Cloud Console.
   - Create OAuth 2.0 Client IDs (Web application).
   - Add the authorized redirect URI: `https://iap.googleapis.com/v1/oauth/clientIds/CLIENT_ID:handleRedirect`.
4. **Enable IAP**:
   - Navigate to **Security > Identity-Aware Proxy**.
   - Select your Backend Service and add the **IAP-secured Web App User** role to authorized individuals or groups.

---

## TLS Certificates
Visulate's built-in `reverseproxy` container can handle TLS termination, or you can offload it to a Cloud Load Balancer.

### Using Cloud Load Balancer (Recommended for IAP)
When using IAP with a Global External Load Balancer, you should use [Google-managed SSL certificates](https://cloud.google.com/load-balancing/docs/ssl-certificates/google-managed-certs). These are provisioned automatically once your DNS points to the Load Balancer's IP.

### Manual TLS in Docker Compose
If you prefer to manage certificates directly on the VM:
1. **Place Certificates**: Copy your `fullchain.pem` and `privkey.pem` to `/home/visulate/config/certs/`.
2. **Update Reverse Proxy**: Modify the `nginx` configuration (if applicable) or ensure the containers are configured to use the mounted certificate volume.
