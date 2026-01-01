FROM python:3.12-slim

WORKDIR /app

# Copy dependency files and README
COPY pyproject.toml uv.lock* README.md ./

# Create dummy package directories to allow dependency installation
RUN mkdir common root_agent nl2sql_agent comment_generator object_analysis_agent erd_agent schema_analysis_agent && \
  touch common/__init__.py root_agent/__init__.py nl2sql_agent/__init__.py comment_generator/__init__.py object_analysis_agent/__init__.py erd_agent/__init__.py schema_analysis_agent/__init__.py

# Install dependencies
RUN pip install --no-cache-dir .

# Copy the rest of the application source code
COPY . .

# Ensure downloads directory exists
RUN mkdir -p /app/downloads

# Re-install to include the actual code (fast)
RUN pip install --no-cache-dir .

# Expose agent ports
EXPOSE 10000 10001 10002 10003 10004 10005

# Make startup script executable
RUN chmod +x start_agents.sh

# Set entrypoint
ENTRYPOINT ["./start_agents.sh"]
