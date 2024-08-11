#!/bin/bash
# Start Docker service
systemctl start docker
# Pull the Docker container images
docker pull docker/compose:latest
docker pull gcr.io/visulate-llc-public/visulate-for-oracle:2.0
docker pull gcr.io/visulate-llc-public/visulate-for-oracle/ui:2.0
docker pull gcr.io/visulate-llc-public/visulate-for-oracle/sql:2.0
docker pull gcr.io/visulate-llc-public/visulate-for-oracle/proxy:2.0

# Create visulate directory if it doesn't exist
if [ ! -d /home/visulate ]; then
  mkdir /home/visulate
fi

# Create a config directory if it doesn't exist
if [ ! -d /home/visulate/config ]; then
  mkdir /home/visulate/config

  # copy the API server config files from the container to the host
  api_container=$(docker create --rm gcr.io/visulate-llc-public/visulate-for-oracle:2.0)
  docker cp "$api_container:/visulate-server/config" /home/visulate
  docker rm "$api_container"

  # copy the query engine config files from the container to the host
  docker run --rm gcr.io/visulate-llc-public/visulate-for-oracle/sql:2.0 cat /query-engine/sql2csv/config/endpoints.json > /home/visulate/config/endpoints.json
fi

# Create docker-compose.yml if not already present
if [ ! -f /home/visulate/docker-compose.yaml ]; then
cat << 'EOF' > /home/visulate/docker-compose.yaml
version: "3.8"
services:
  reverseproxy:
    image: gcr.io/visulate-llc-public/visulate-for-oracle/proxy:2.0
    container_name: reverseproxy
    ports:
      - 80:80
    networks:
      - visulate_network

  visapi:
    image: gcr.io/visulate-llc-public/visulate-for-oracle:2.0
    container_name: visapi
    expose:
      - "3000"
    volumes:
      - /home/visulate/config:/visulate-server/config
    networks:
      - visulate_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  visui:
    image: gcr.io/visulate-llc-public/visulate-for-oracle/ui:2.0
    container_name: visui
    expose:
      - "80"
    networks:
      - visulate_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3

  vissql:
    image: gcr.io/visulate-llc-public/visulate-for-oracle/sql:2.0
    container_name: vissql
    expose:
      - "5000"
    volumes:
      - /home/visulate/config:/query-engine/sql2csv/config
    networks:
      - visulate_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  visulate_network:
EOF
fi

# Create the docker-compose.sh script if not present
if [ ! -f /home/visulate/docker-compose.sh ]; then
  cat << 'SCRIPT' > /home/visulate/docker-compose.sh
#!/bin/bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD:$PWD" \
  -w="$PWD" \
  docker/compose:latest "$@"
SCRIPT
  chmod +x /home/visulate/docker-compose.sh
fi

# Create the update-visulate.sh script
if [ ! -f /home/visulate/update-visulate.sh ]; then
  cat << 'SCRIPT' > /home/visulate/update-visulate.sh
#!/bin/bash
docker pull docker/compose:latest
docker pull gcr.io/visulate-llc-public/visulate-for-oracle:2.0
docker pull gcr.io/visulate-llc-public/visulate-for-oracle/ui:2.0
docker pull gcr.io/visulate-llc-public/visulate-for-oracle/sql:2.0
docker pull gcr.io/visulate-llc-public/visulate-for-oracle/proxy:2.0
SCRIPT
  chmod +x /home/visulate/update-visulate.sh
fi

# Create th alias.env file
if [ ! -f /home/visulate/alias.env ]; then
  cat << 'SCRIPT' > /home/visulate/alias.env
alias docker-compose='bash /home/visulate/docker-compose.sh'
alias update-visulate='bash /home/visulate/update-visulate.sh'
alias sqlplus='docker exec -it visapi sqlplus'
SCRIPT
  chmod +x /home/visulate/alias.env
fi

# Set a global alias for docker-compose
# Append to /etc/profile.d/ to ensure it's available in all shell sessions
echo "alias docker-compose='bash /home/visulate/docker-compose.sh'" | tee /etc/profile.d/docker-compose-alias.sh
# Make the alias script executable
chmod +x /etc/profile.d/docker-compose-alias.sh

# Navigate to the directory containing docker-compose.yaml
cd /home/visulate
# Start the application
bash docker-compose.sh up -d