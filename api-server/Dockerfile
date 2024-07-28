# Copyright 2019, 2024 Visulate LLC. All Rights Reserved.
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

FROM oraclelinux:8-slim
ARG oracleRelease=19
ARG oracleUpdate=23

# Install Oracle Instant Client and Node.js
RUN microdnf install dnf -y
RUN  dnf -y install oracle-release-el8 && \
     dnf config-manager --set-enabled ol8_oracle_instantclient && \
     dnf -y install oracle-instantclient${oracleRelease}.${oracleUpdate}-basic oracle-instantclient${oracleRelease}.${oracleUpdate}-devel oracle-instantclient${oracleRelease}.${oracleUpdate}-sqlplus && \
     dnf -y module enable nodejs:20 && \
     dnf -y install nodejs npm && \
     npm install -g npm@latest && \
     rm -rf /var/cache/yum

# Set working directory and copy project files
WORKDIR /visulate-server
COPY app.js openapi.yaml package.json /visulate-server/
COPY services/ /visulate-server/services/
COPY database-setup/ /visulate-server/database-setup/
COPY config/ /visulate-server/config/

# Copy Oracle configuration file
COPY ./database-setup/sqlnet.ora /usr/lib/oracle/${oracleRelease}.${oracleUpdate}/client64/lib/network/admin

# Set environment variables
ENV PATH=$PATH:/usr/lib/oracle/${oracleRelease}.${oracleUpdate}/client64/bin

# Install npm dependencies without development dependencies
RUN npm install --omit=dev

# Remove pip and setuptools from site-packages
RUN rm -rf /usr/lib/python3.6/site-packages/pip* && \
    rm -rf /usr/lib/python3.6/site-packages/setuptools* && \
    rm -rf /usr/lib/python3.6/site-packages/__pycache__

# Set the command to start the application
CMD exec npm start