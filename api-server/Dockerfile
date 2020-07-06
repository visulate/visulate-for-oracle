# Copyright 2019, 2020 Visulate LLC. All Rights Reserved.
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

RUN  yum -y install oracle-release-el7  oracle-nodejs-release-el7 && \
     yum-config-manager --enable ol7_oracle_instantclient && \
     yum -y install nodejs && \
     yum -y install oracle-instantclient${oracleRelease}.${oracleUpdate}-basic oracle-instantclient${oracleRelease}.${oracleUpdate}-devel oracle-instantclient${oracleRelease}.${oracleUpdate}-sqlplus && \
     rm -rf /var/cache/yum

WORKDIR /visulate-server
COPY . /visulate-server

COPY ./database-setup/sqlnet.ora /usr/lib/oracle/${oracleRelease}.${oracleUpdate}/client64/lib/network/admin

ENV PATH=$PATH:/usr/lib/oracle/${oracleRelease}.${oracleUpdate}/client64/bin

RUN npm install --production
CMD exec npm start
