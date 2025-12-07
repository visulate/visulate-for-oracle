FROM python:3.12-slim

WORKDIR /app

# Copy dependency files
COPY pyproject.toml .

# Install dependencies including the project itself in editable mode if feasible,
# or just requirements. For pyproject.toml we can use pip.
# Note: --no-cache-dir reduces image size
RUN pip install --no-cache-dir .

# Copy agent code
COPY . .

# Expose agent ports
EXPOSE 10000
EXPOSE 10001

# Make startup script executable
RUN chmod +x start_agents.sh

# Set entrypoint
ENTRYPOINT ["./start_agents.sh"]
