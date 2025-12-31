#!/bin/bash
# Start Docker service
systemctl start docker

# Image repository
IMAGE_REPO="gcr.io/visulate-llc-public"

# Pull the Docker container images
docker pull docker/compose:latest
docker pull ${IMAGE_REPO}/visulate-for-oracle:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/ui:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/sql:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/proxy:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/ai-agent:2.5

# Create visulate directory if it doesn't exist
if [ ! -d /home/visulate ]; then
  mkdir /home/visulate
fi

# Create a config directory if it doesn't exist
if [ ! -d /home/visulate/config ]; then
  mkdir /home/visulate/config

  # copy the API server config files from the container to the host
  api_container=$(docker create --rm ${IMAGE_REPO}/visulate-for-oracle:2.5)
  docker cp "$api_container:/visulate-server/config/." /home/visulate/config/
  docker rm "$api_container"

  # copy the query engine config files from the container to the host
  docker run --rm ${IMAGE_REPO}/visulate-for-oracle/sql:2.5 cat /query-engine/sql2csv/config/endpoints.json > /home/visulate/config/endpoints.json
fi

# Create visulate-downloads directory if it doesn't exist
if [ ! -d /home/visulate/downloads ]; then
  mkdir /home/visulate/downloads
  chmod 777 /home/visulate/downloads
fi

# Create docker-compose.yml if not already present
if [ ! -f /home/visulate/docker-compose.yaml ]; then
cat << EOF > /home/visulate/docker-compose.yaml
version: "3.8"
services:
  reverseproxy:
    image: ${IMAGE_REPO}/visulate-for-oracle/proxy:2.5
    container_name: reverseproxy
    ports:
      - 80:80
    networks:
      - visulate_network

  visapi:
    image: ${IMAGE_REPO}/visulate-for-oracle:2.5
    container_name: visapi
    hostname: visapi
    depends_on:
      - reverseproxy
    expose:
      - "3000"
    volumes:
      - /home/visulate/config:/visulate-server/config
      - visulate-downloads:/visulate-server/downloads
    environment:
      - GOOGLE_AI_KEY=\${GOOGLE_AI_KEY}
      - CORS_ORIGIN_WHITELIST=\${CORS_ORIGIN_WHITELIST}
      - VISULATE_AGENT_URL=http://ai-agent:10000/agent/generate
      - COMMENT_GENERATOR_URL=http://ai-agent:10003/agent/generate
    networks:
      - visulate_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  visui:
    image: ${IMAGE_REPO}/visulate-for-oracle/ui:2.5
    container_name: visui
    hostname: visui
    depends_on:
      - reverseproxy
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
    image: ${IMAGE_REPO}/visulate-for-oracle/sql:2.5
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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000"]
      interval: 30s
      timeout: 10s
      retries: 3

  ai-agent:
    image: ${IMAGE_REPO}/visulate-for-oracle/ai-agent:2.5
    container_name: ai-agent
    hostname: ai-agent
    depends_on:
      - reverseproxy
      - vissql
      - visapi
    expose:
      - "10000-10005"
    volumes:
      - visulate-downloads:/app/downloads
    environment:
      - GOOGLE_AI_KEY=\${GOOGLE_AI_KEY}
      - GOOGLE_API_KEY=\${GOOGLE_AI_KEY}
      - VISULATE_BASE=http://reverseproxy
      - VISULATE_DOWNLOADS=/app/downloads
    networks:
      - visulate_network
    healthcheck:
      test: ["CMD-SHELL", "python3 -c \"import requests; requests.get('http://localhost:10000/openapi.json').raise_for_status()\" || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  visulate-downloads:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /home/visulate/downloads

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
  -e GOOGLE_AI_KEY \
  -e GOOGLE_API_KEY \
  docker/compose:latest "$@"
SCRIPT
  chmod +x /home/visulate/docker-compose.sh
fi

# Create the update-visulate.sh script
if [ ! -f /home/visulate/update-visulate.sh ]; then
  cat << SCRIPT > /home/visulate/update-visulate.sh
#!/bin/bash
docker pull docker/compose:latest
docker pull ${IMAGE_REPO}/visulate-for-oracle:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/ui:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/sql:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/proxy:2.5
docker pull ${IMAGE_REPO}/visulate-for-oracle/ai-agent:2.5
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