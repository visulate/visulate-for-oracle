FROM node:12.13.0-alpine AS builder
COPY . ./visulate-client
WORKDIR /visulate-client
RUN npm i
RUN $(npm bin)/ng build --prod

FROM nginx:1.16.1-alpine
COPY --from=builder /visulate-client/dist/client/assets/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /visulate-client/dist/client/ /usr/share/nginx/html
