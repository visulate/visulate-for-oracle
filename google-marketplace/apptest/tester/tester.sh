#!/bin/bash
#
# Copyright 2021, 2024 Visulate LLC
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

set -xeo pipefail
shopt -s nullglob

echo "Starting tests"
echo "Get External IP"

EXTERNAL_IP="$(kubectl get service/${APP_INSTANCE_NAME}-visulate-for-oracle-proxy-svc \
  --namespace ${NAMESPACE} \
  --output jsonpath='{.spec.clusterIP}')"

echo "External IP : $EXTERNAL_IP"
export EXTERNAL_IP

curlversion=$(curl --version)
echo "curl version : $curlversion"

now=$(date +"%T")
echo "Current time : $now"
echo "Start tests"
for test in /tests/*; do
  testrunner -logtostderr "--test_spec=${test}"
done
