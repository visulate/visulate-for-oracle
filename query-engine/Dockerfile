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
FROM oraclelinux:8
# Install Python 3.11 and pip
RUN dnf install -y python3.11 python3-pip && \
    python3.11 -m ensurepip --upgrade && \
    rm -rf /var/cache/yum && \
    python3.11 --version && python3.11 -m pip --version

# Update alternatives to use Python 3.11 as default python3
RUN alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    alternatives --set python3 /usr/bin/python3.11

# Create a new user and set up the environment
RUN adduser queryeng
USER queryeng
ENV PATH="/home/queryeng/.local/bin:${PATH}"
ENV PYTHONPATH=/query-engine

# Copy the project files and install dependencies
COPY --chown=queryeng:queryeng . /query-engine/
WORKDIR /query-engine
RUN python3.11 -m pip install --upgrade pip && python3.11 -m pip install setuptools-rust && \
    python3.11 -m pip install oracledb --upgrade --user && \
    python3.11 -m pip install wheel --user && \
    python3.11 setup.py bdist_wheel

# Install requirements
COPY requirements.txt /var/www/requirements.txt
RUN python3.11 -m pip install -r /var/www/requirements.txt --user

# Install the built wheel
COPY dist/sql2csv-2.0.0-py3-none-any.whl /var/www/sql2csv-2.0.0-py3-none-any.whl
RUN python3.11 -m pip install /var/www/sql2csv-2.0.0-py3-none-any.whl --user

# Set the command to run the application
CMD gunicorn --worker-tmp-dir /dev/shm --workers=2 --threads=4 --worker-class=gthread --bind 0.0.0.0:5000 "sql2csv:create_app()"
