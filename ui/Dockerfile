# Copyright 2019, 2022 Visulate LLC. All Rights Reserved.
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

FROM node:18-alpine AS builder
COPY . ./visulate-client
WORKDIR /visulate-client
RUN npm install -g npm@10.2.5
RUN npm i
RUN node_modules/.bin/ng build --configuration production

FROM nginx:stable
COPY --from=builder /visulate-client/dist/client/assets/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /visulate-client/dist/client/ /usr/share/nginx/html
