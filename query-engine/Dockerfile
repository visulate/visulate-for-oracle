FROM oraclelinux:7-slim
ARG oracleRelease=19
ARG oracleUpdate=5

RUN  yum -y install oracle-release-el7 && \
     yum-config-manager --enable ol7_oracle_instantclient && \
     yum -y install oracle-instantclient${oracleRelease}.${oracleUpdate}-basic oracle-instantclient${oracleRelease}.${oracleUpdate}-devel oracle-instantclient${oracleRelease}.${oracleUpdate}-sqlplus && \
     rm -rf /var/cache/yum

RUN yum install -y python36 && \
    python3.6 -m pip install cx_Oracle &&\
    rm -rf /var/cache/yum

COPY ./requirements.txt /var/www/requirements.txt
RUN python3.6 -m pip install -r /var/www/requirements.txt

COPY ./dist/sql2csv-1.0.0-py3-none-any.whl /var/www/sql2csv-1.0.0-py3-none-any.whl
RUN python3.6 -m pip install /var/www/sql2csv-1.0.0-py3-none-any.whl

CMD exec waitress-serve --call 'sql2csv:create_app'