FROM alpine:3.10
RUN apk add --no-cache curl jq bash coreutils

WORKDIR /visulate/bin
COPY ubbagent-database_connections.sh /visulate/bin

CMD ["/bin/sh"]