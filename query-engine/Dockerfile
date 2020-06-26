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

# FROM tiangolo/uwsgi-nginx-flask:python3.8-alpine
# RUN apk --update add bash vim gcc && python3 -m pip install cx_Oracle --upgrade
ENV STATIC_URL /static
ENV STATIC_PATH /var/www/app/static
COPY ./requirements.txt /var/www/requirements.txt
RUN python3.6 -m pip install -r /var/www/requirements.txt