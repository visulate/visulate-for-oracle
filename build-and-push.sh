#!/bin/bash
set -e

# Project Selection
echo "Select GCP Project:"
echo "1) visulate-for-oracle"
echo "2) visulate-llc-public"
read -p "Selection [1]: " proj_choice
case $proj_choice in
    2) PROJECT_ID="visulate-llc-public" ;;
    *) PROJECT_ID="visulate-for-oracle" ;;
esac

echo "Setting project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# Get Version
if [[ -z "$1" ]]; then
    read -p "Enter version (e.g., 2.5.1): " VERSION
else
    VERSION=$1
fi

if [[ -z "$VERSION" ]]; then
    echo "Error: Version is required."
    exit 1
fi

# Schema.yaml Check
echo "----------------------------------------------------------------"
read -p "Have you updated the release note in google-marketplace/schema.yaml? (y/n): " schema_check
if [[ "$schema_check" != "y" ]]; then
    echo "Please update google-marketplace/schema.yaml and restart the build."
    exit 1
fi

# Build Type Selection
echo "----------------------------------------------------------------"
echo "Select Build Type:"
echo "1) Full Build (All Images - slow)"
echo "2) Fast Build (Single Component - fast)"
read -p "Selection [1]: " build_type

if [[ "$build_type" == "2" ]]; then
    echo "----------------------------------------------------------------"
    echo "Select Component:"
    echo "1) API Server"
    echo "2) UI"
    echo "3) SQL (Query Engine)"
    echo "4) Proxy"
    echo "5) AI Agent"
    read -p "Selection: " comp_choice
    case $comp_choice in
        1) IMAGE_SUFFIX=""           DIR="api-server" ;;
        2) IMAGE_SUFFIX="/ui"        DIR="ui" ;;
        3) IMAGE_SUFFIX="/sql"       DIR="query-engine" ;;
        4) IMAGE_SUFFIX="/proxy"     DIR="proxy-config" ;;
        5) IMAGE_SUFFIX="/ai-agent"  DIR="ai-agent" ;;
        *) echo "Invalid selection"; exit 1 ;;
    esac

    echo "================================================================"
    echo " FAST BUILDING $DIR v$VERSION"
    echo "================================================================"
    gcloud builds submit --config cloudbuild-component.yaml \
        --substitutions=_VERSION="$VERSION",_IMAGE_SUFFIX="$IMAGE_SUFFIX",_DIR="$DIR" .
else
    echo "================================================================"
    echo " BUILDING ALL COMPONENTS v$VERSION"
    echo "================================================================"
    gcloud builds submit --config cloudbuild.yaml --substitutions=_VERSION="$VERSION" .
fi

echo "================================================================"
echo " BUILD COMPLETE"
echo "================================================================"
