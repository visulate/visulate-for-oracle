FROM oraclelinux:7-slim
ARG oracleRelease=19
ARG oracleUpdate=5

RUN  yum -y install oracle-release-el7  oracle-nodejs-release-el7 && \
     yum-config-manager --enable ol7_oracle_instantclient && \
     yum -y install nodejs && \
     yum -y install oracle-instantclient${oracleRelease}.${oracleUpdate}-basic oracle-instantclient${oracleRelease}.${oracleUpdate}-devel oracle-instantclient${oracleRelease}.${oracleUpdate}-sqlplus && \
     rm -rf /var/cache/yum

WORKDIR /visulate-server
COPY . /visulate-server

ENV PATH=$PATH:/usr/lib/oracle/${oracleRelease}.${oracleUpdate}/client64/bin

RUN npm install --production
CMD exec npm start
