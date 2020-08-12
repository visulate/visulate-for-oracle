# Copyright 2020 Visulate LLC. All Rights Reserved.
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
FROM oraclelinux:7-slim
ARG oracleRelease=19
ARG oracleUpdate=6

RUN  yum -y install oracle-release-el7 && \
     yum-config-manager --enable ol7_oracle_instantclient && \
     yum -y install oracle-instantclient${oracleRelease}.${oracleUpdate}-basic oracle-instantclient${oracleRelease}.${oracleUpdate}-devel oracle-instantclient${oracleRelease}.${oracleUpdate}-sqlplus && \
     rm -rf /var/cache/yum

RUN yum install -y python36 && \
    rm -rf /var/cache/yum

RUN adduser queryeng
USER queryeng
ENV PATH="/home/queryeng/.local/bin:${PATH}"
ENV PYTHONPATH=/query-engine

COPY --chown=queryeng:queryeng . /query-engine/
WORKDIR /query-engine
RUN python3.6 -m pip install cx_Oracle --user
RUN python3.6 -m pip install wheel --user
RUN python3.6 setup.py bdist_wheel

COPY requirements.txt /var/www/requirements.txt
RUN python3.6 -m pip install -r /var/www/requirements.txt --user

COPY dist/sql2csv-1.1.0-py3-none-any.whl /var/www/sql2csv-1.1.0-py3-none-any.whl
RUN python3.6 -m pip install /var/www/sql2csv-1.1.0-py3-none-any.whl --user

CMD exec waitress-serve --port=5000 --call 'sql2csv:create_app'