#!/bin/bash
#
# Copyright 2021 Visulate LLC
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

# Wait until no Ingress backends report "Unknown" status
until kubectl get ingress "${APP_INSTANCE_NAME}-igs" \
  --namespace "${NAMESPACE}" \
  --output jsonpath='{.metadata.annotations.ingress\.kubernetes\.io/backends}' \
  | jq -e '([.. | strings | select(. == "Unknown")] | length == 0)'
do
  sleep 10
done

# Wait 2 minutes after the ingress reports it is healthy before starting the tests
# to avoid 502 errors
now=$(date +"%T")
echo "Current time : $now"
echo "waiting 2 minutes for loadBalancer resources"
sleep 120

# Start tests
backend_status="$(kubectl get ingress ${APP_INSTANCE_NAME}-igs \
  --namespace ${NAMESPACE} \
  --output jsonpath='{.metadata.annotations.ingress\.kubernetes\.io/backends}')"

echo "Backend Status : $backend_status"

EXTERNAL_IP="$(kubectl get ingress/${APP_INSTANCE_NAME}-igs \
  --namespace ${NAMESPACE} \
  --output jsonpath='{.status.loadBalancer.ingress[0].ip}')"

export EXTERNAL_IP

curlversion=$(curl --version)
echo "curl version : $curlversion"

now=$(date +"%T")
echo "Current time : $now"
echo "Start tests"
for test in /tests/*; do
  testrunner -logtostderr "--test_spec=${test}"
done
