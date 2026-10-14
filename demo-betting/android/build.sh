#!/usr/bin/env bash
# Builds the Demo Betting Android app (a WebView around the website) into
# ../download/demo-betting.apk — no Gradle or Android Studio needed.
#
# Tools (Ubuntu/Debian):
#   sudo apt-get install openjdk-17-jdk aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
#
# Usage:
#   KS_PASS='your keystore password' SITE_URL=https://nssr.studio ./build.sh
#
# The signing key is android/keystore/release.jks (git-ignored). It is created on the first
# build. Keep it and its password safe: every later version must be signed with the same key,
# or phones refuse to install it as an update.
set -euo pipefail
cd "$(dirname "$0")"

SITE_URL="${SITE_URL:-https://nssr.studio}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
KEYSTORE="${KEYSTORE:-keystore/release.jks}"
KEY_ALIAS="${KEY_ALIAS:-demobetting}"
: "${KS_PASS:?Set KS_PASS to the keystore password}"
OUT=build
APK=../download/demo-betting.apk

case "$SITE_URL" in https://*) ;; *) echo "SITE_URL must start with https://" >&2; exit 1 ;; esac
[ -f "$ANDROID_JAR" ] || { echo "android.jar not found at $ANDROID_JAR" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes"
cp -r res "$OUT/res"
sed -e "s|@VERSION_CODE@|$VERSION_CODE|" -e "s|@VERSION_NAME@|$VERSION_NAME|" AndroidManifest.xml > "$OUT/AndroidManifest.xml"
sed -i "s|@SITE_URL@|${SITE_URL%/}|" "$OUT/res/values/strings.xml"

echo "1/6 resources"
aapt package -f -m -J "$OUT/gen" -M "$OUT/AndroidManifest.xml" -S "$OUT/res" -A assets -I "$ANDROID_JAR" -F "$OUT/app.unaligned.apk"

echo "2/6 compile"
javac --release 8 -nowarn -Xlint:-options -encoding UTF-8 -cp "$ANDROID_JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java')

echo "3/6 dex"
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add -k app.unaligned.apk classes.dex > /dev/null)

echo "4/6 align"
zipalign -f -p 4 "$OUT/app.unaligned.apk" "$OUT/app.aligned.apk"

echo "5/6 sign"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Demo Betting, O=nssr.studio" -storepass "$KS_PASS" -keypass "$KS_PASS" > /dev/null
  echo "    created new signing key $KEYSTORE — back it up"
fi
mkdir -p "$(dirname "$APK")"
apksigner sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" --ks-pass env:KS_PASS --key-pass env:KS_PASS \
  --min-sdk-version 21 --out "$APK" "$OUT/app.aligned.apk"

echo "6/6 verify"
apksigner verify --min-sdk-version 21 "$APK"
rm -f "$APK.idsig"
echo "done: $(cd "$(dirname "$APK")" && pwd)/$(basename "$APK") ($(du -h "$APK" | cut -f1)), opens $SITE_URL"
