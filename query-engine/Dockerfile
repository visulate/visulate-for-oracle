# Copyright 2020 - 2024 Visulate LLC. All Rights Reserved.
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

# Install Python 3.11 and pip
RUN microdnf install -y python3.11 python3-pip && \
    python3.11 -m ensurepip --upgrade && \
    rm -rf /var/cache/yum && \
    python3.11 --version && python3.11 -m pip --version && \
    python3.11 -m pip install --upgrade pip && \
    alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    alternatives --set python3 /usr/bin/python3.11

# Create a new user and set up the environment
RUN adduser queryeng
USER queryeng
ENV PATH="/home/queryeng/.local/bin:${PATH}"
ENV PYTHONPATH=/query-engine
ENV TNS_ADMIN=/opt/oracle/network/admin

USER root
RUN mkdir -p /opt/oracle/network/admin && chown queryeng:queryeng /opt/oracle/network/admin
USER queryeng

# Copy the project files and install dependencies
COPY --chown=queryeng:queryeng . /query-engine/
WORKDIR /query-engine

# Install dependencies and build the wheel
RUN python3.11 -m pip install --upgrade pip setuptools-rust wheel --user && \
    python3.11 -m pip install oracledb --upgrade --user && \
    python3.11 -m pip install -r requirements.txt --user && \
    python3.11 setup.py bdist_wheel && \
    rm -rf /home/queryeng/.cache/pip

# Install the built wheel
COPY --chown=queryeng:queryeng dist/sql2csv-2.0.0-py3-none-any.whl /var/www/sql2csv-2.0.0-py3-none-any.whl
RUN python3.11 -m pip install /var/www/sql2csv-2.0.0-py3-none-any.whl --user && \
    rm -rf /home/queryeng/.cache/pip

# Remove old pip and setuptools from site-packages
USER root
RUN rm -rf /usr/lib/python3.9/site-packages/pip* && \
    rm -rf /usr/lib/python3.9/site-packages/setuptools* && \
    rm -rf /usr/lib/python3.9/site-packages/__pycache__ && \
    pip3 install --upgrade setuptools

# Set the command to run the application
# Copy startup script
COPY --chown=queryeng:queryeng start.sh /query-engine/start.sh
RUN chmod +x /query-engine/start.sh

# Set the command to run the application
USER queryeng
CMD ["/query-engine/start.sh"]
