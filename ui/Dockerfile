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

# 1. Set the working directory
WORKDIR /visulate-client

# 2. Copy only the dependency files first.
# This layer is cached separately so dependency installs are fast when only
# source files change.
COPY package.json package-lock.json ./

# 3. Install all dependencies (production and development)
# Use 'npm install' rather than 'npm ci' to avoid strict lock file sync errors
# caused by peer dependency resolution differences across npm versions.
RUN npm install

# 4. Copy the rest of the application source code
COPY . .

# 5. Build the application for production
RUN npx ng build --configuration production

# 6. Remove node_modules to reduce final image size
RUN rm -rf node_modules

# STAGE 2: Production Server
FROM nginx:alpine

# Copy the nginx configuration file
# NOTE: The path '/visulate-client/dist/client/browser/assets/nginx.conf'
# assumes your Angular config places assets directly under 'browser/assets'.
COPY --from=builder /visulate-client/dist/client/browser/assets/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built application
# NOTE: The path '/visulate-client/dist/client/browser/' is standard for Angular builds.
COPY --from=builder /visulate-client/dist/client/browser/ /usr/share/nginx/html

EXPOSE 80