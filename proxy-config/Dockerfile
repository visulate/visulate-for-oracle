FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf

# Create the certs volume
RUN mkdir /certs
VOLUME /certs

RUN apk update && apk add bash && apk add openssl