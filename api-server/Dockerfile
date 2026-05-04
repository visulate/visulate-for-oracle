# Copyright 2019, 2026 Visulate LLC. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM oraclelinux:9-slim
ARG oracleRelease=19
ARG oracleUpdate=30

# Install Oracle Instant Client and Node.js
# 1. Install the specific release package for OL9 Instant Client
# 2. Install the client packages (the repo is enabled by the release package)
# 3. Install Node.js (OL9 provides Node.js 20 by default in the appstream repo)
RUN microdnf update -y && \
    microdnf install -y oracle-instantclient-release-el9 && \
    microdnf install -y \
    oracle-instantclient${oracleRelease}.${oracleUpdate}-basic \
    oracle-instantclient${oracleRelease}.${oracleUpdate}-devel \
    oracle-instantclient${oracleRelease}.${oracleUpdate}-sqlplus && \
    microdnf module enable nodejs:24 -y && \
    microdnf install -y nodejs npm findutils && \
    npm install -g npm@latest && \
    microdnf clean all

# Set working directory and copy project files
WORKDIR /visulate-server
COPY app.js openapi.yaml package.json /visulate-server/
COPY services/ /visulate-server/services/
COPY database-setup/ /visulate-server/database-setup/
COPY config/ /visulate-server/config/

# Copy Oracle configuration file
RUN mkdir -p /opt/oracle/network/admin
COPY ./database-setup/sqlnet.ora /opt/oracle/network/admin/sqlnet.ora

# Set environment variables
ENV PATH=$PATH:/usr/lib/oracle/${oracleRelease}.${oracleUpdate}/client64/bin
ENV TNS_ADMIN=/opt/oracle/network/admin

# Install npm dependencies without development dependencies
RUN npm install --omit=dev

# Remove pip, setuptools and wheels to address vulnerabilities
RUN rm -rf /usr/bin/pip* /usr/bin/easy_install* && \
    find /usr/lib /usr/lib64 /usr/local/lib /usr/share -name "pip*" -type d -exec rm -rf {} + && \
    find /usr/lib /usr/lib64 /usr/local/lib /usr/share -name "setuptools*" -type d -exec rm -rf {} + && \
    rm -rf /usr/share/python3-wheels/* && \
    rm -rf /usr/lib/python*/site-packages/__pycache__

# Set the command to start the application
CMD exec npm start