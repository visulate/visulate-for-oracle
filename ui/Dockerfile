# Copyright 2019, 2024 Visulate LLC. All Rights Reserved.
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

FROM node:22-alpine AS builder

# Copy the source code
COPY . ./visulate-client
WORKDIR /visulate-client

# Install latest npm
RUN npm install -g npm@latest

# Install all dependencies (both production and development)
RUN npm ci

# Build the application
RUN npx ng build --configuration production

# Remove node_modules to clean up unnecessary dependencies
RUN rm -rf node_modules

# Install only production dependencies
RUN npm ci --omit=dev

FROM nginx:stable

# Copy the nginx configuration file
COPY --from=builder /visulate-client/dist/client/browser/assets/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built application
COPY --from=builder /visulate-client/dist/client/browser/ /usr/share/nginx/html
