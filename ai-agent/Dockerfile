FROM python:3.12-slim

WORKDIR /app

# Copy agent code
COPY . .

# Ensure downloads directory exists
RUN mkdir -p /app/downloads

# Install dependencies and the package
RUN pip install --no-cache-dir .

# Expose agent ports
EXPOSE 10000 10001 10002 10003 10004 10005

# Make startup script executable
RUN chmod +x start_agents.sh

# Set entrypoint
ENTRYPOINT ["./start_agents.sh"]
