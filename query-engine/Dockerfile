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

# Install Python 3.12 and pip
RUN microdnf update -y && \
    microdnf install -y python3.12 python3-pip && \
    python3.12 -m ensurepip --upgrade && \
    microdnf clean all && \
    python3.12 --version && python3.12 -m pip --version && \
    python3.12 -m pip install --upgrade "pip>=26.1" "setuptools>=82.0.1" && \
    alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 && \
    alternatives --set python3 /usr/bin/python3.12

# Create a new user and set up the environment
RUN adduser queryeng
USER queryeng
ENV PATH="/home/queryeng/.local/bin:${PATH}"
ENV PYTHONPATH=/query-engine
ENV TNS_ADMIN=/opt/oracle/network/admin

USER root
RUN mkdir -p /opt/oracle/network/admin && chown queryeng:queryeng /opt/oracle/network/admin
USER queryeng

# Copy the project files
COPY --chown=queryeng:queryeng . /query-engine/
WORKDIR /query-engine

# Install dependencies and build the wheel
# This creates /query-engine/dist/sql2csv-2.6.2-py3-none-any.whl
RUN python3.12 -m pip install --upgrade "pip>=26.1" "setuptools>=82.0.1" setuptools-rust wheel --user && \
    python3.12 -m pip install oracledb --upgrade --user && \
    python3.12 -m pip install -r requirements.txt --user && \
    python3.12 setup.py bdist_wheel && \
    rm -rf /home/queryeng/.cache/pip

# Install the built wheel
RUN python3.12 -m pip install dist/sql2csv-2.6.2-py3-none-any.whl --user && \
    rm -rf /home/queryeng/.cache/pip

# Remove old pip and setuptools from site-packages and upgrade to safe versions
USER root
RUN rm -rf /usr/lib/python3.*/site-packages/pip* && \
    rm -rf /usr/lib/python3.*/site-packages/setuptools* && \
    rm -rf /usr/lib/python3.*/site-packages/__pycache__ && \
    python3.12 -m ensurepip --upgrade && \
    python3.12 -m pip install --upgrade "pip>=26.1" "setuptools>=82.0.1"

# Set the command to run the application
# Copy startup script
COPY --chown=queryeng:queryeng start.sh /query-engine/start.sh
RUN chmod +x /query-engine/start.sh

# Set the command to run the application
USER queryeng
CMD ["/query-engine/start.sh"]
