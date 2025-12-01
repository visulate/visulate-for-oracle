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

FROM node:lts-alpine AS builder

# 1. Set the working directory
WORKDIR /visulate-client

# 2. Copy only the dependency files first.
# This ensures that the 'npm ci' step only rebuilds if package.json or
# package-lock.json changes, which makes dependency installation faster and
# ensures the correct lock file is always used for 'npm ci'.
COPY package.json package-lock.json ./

# 3. Install latest npm globally (Good practice, but often unnecessary with lts-alpine)
RUN npm install -g npm@latest

# 4. Install all dependencies (production and development)
# This step relies on the package.json and package-lock.json copied above.
RUN npm ci

# 5. Copy the rest of the application source code
# This step is much faster since the heavy dependency installation is already cached.
COPY . .

# 6. Build the application for production
RUN npx ng build --configuration production

# 7. Remove node_modules to reduce final image size
RUN rm -rf node_modules

# 8. Re-install ONLY production dependencies for the final stage
# This is often skipped if you use a lightweight HTTP server like NGINX in Stage 2,
# but included here if your app requires Node.js runtime prod dependencies.
# Since you use NGINX in Stage 2, this step is arguably redundant but harmless.
RUN npm ci --omit=dev

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