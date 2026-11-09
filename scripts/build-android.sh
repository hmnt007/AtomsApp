#!/usr/bin/env bash
set -e

# AtomsApp Android Build Script

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
OUTPUT_DIR="$PROJECT_ROOT/build-outputs"

echo "========================================"
echo "  AtomsApp - Android Build Generator"
echo "========================================"

# 1. Resolve JAVA_HOME - prioritize system-installed Java 17 with valid certificates
if [ -d "/usr/lib/jvm/java-17-oracle" ]; then
    export JAVA_HOME="/usr/lib/jvm/java-17-oracle"
elif [ -z "$JAVA_HOME" ] || [ ! -d "$JAVA_HOME" ]; then
    if command -v java >/dev/null 2>&1; then
        JAVA_BIN="$(readlink -f "$(command -v java)")"
        export JAVA_HOME="$(dirname "$(dirname "$JAVA_BIN")")"
    fi
fi

if [ -f "/etc/ssl/certs/java/cacerts" ]; then
    export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
fi

echo "Java Home: $JAVA_HOME"
if [ ! -d "$JAVA_HOME" ]; then
    echo "ERROR: Valid JAVA_HOME could not be detected."
    exit 1
fi

# 2. Resolve ANDROID_HOME / ANDROID_SDK_ROOT
if [ -z "$ANDROID_HOME" ]; then
    if [ -d "/home/hemantkumar/Android/Sdk" ]; then
        export ANDROID_HOME="/home/hemantkumar/Android/Sdk"
    fi
fi
if [ -n "$ANDROID_HOME" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
    echo "Android SDK: $ANDROID_HOME"
fi

# Ensure local.properties exists in android/
if [ ! -f "$ANDROID_DIR/local.properties" ] && [ -n "$ANDROID_HOME" ]; then
    echo "sdk.dir=$ANDROID_HOME" > "$ANDROID_DIR/local.properties"
fi

BUILD_TYPE="${1:-apk}"

mkdir -p "$OUTPUT_DIR"
cd "$ANDROID_DIR"

if [ "$BUILD_TYPE" = "clean" ]; then
    echo "Cleaning build cache..."
    ./gradlew clean
    echo "Clean complete."
    exit 0
elif [ "$BUILD_TYPE" = "aab" ] || [ "$BUILD_TYPE" = "bundle" ]; then
    echo "Building Android App Bundle (AAB - Release)..."
    ./gradlew bundleRelease
    
    AAB_SOURCE="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
    if [ -f "$AAB_SOURCE" ]; then
        cp "$AAB_SOURCE" "$OUTPUT_DIR/AtomsApp-release.aab"
        echo "SUCCESS! Bundle generated at: $OUTPUT_DIR/AtomsApp-release.aab"
        ls -lh "$OUTPUT_DIR/AtomsApp-release.aab"
    fi
else
    echo "Building Android APK (Release)..."
    ./gradlew assembleRelease
    
    APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
    if [ -f "$APK_SOURCE" ]; then
        cp "$APK_SOURCE" "$OUTPUT_DIR/AtomsApp-release.apk"
        echo "SUCCESS! APK generated at: $OUTPUT_DIR/AtomsApp-release.apk"
        ls -lh "$OUTPUT_DIR/AtomsApp-release.apk"
    fi
fi

echo "========================================"
echo "  Build finished successfully!"
echo "========================================"
