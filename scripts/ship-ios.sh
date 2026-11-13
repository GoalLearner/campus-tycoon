#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# scripts/ship-ios.sh: build, sign and upload the iPhone app to TestFlight
# from a cloud Mac (a GitHub Actions macOS runner).
#
# It is run by a workflow that holds the signing secrets. This repository
# holds none of them: everything secret arrives in the environment.
#
# Inputs (environment):
#   IOS_DIST_P12_B64       Apple Distribution certificate + private key, .p12, base64
#   IOS_DIST_P12_PASSWORD  the .p12's password
#   ASC_API_KEY_ID         App Store Connect API key id
#   ASC_API_ISSUER_ID      App Store Connect API issuer id
#   ASC_API_KEY_B64        the API key's .p8, base64
#   ART_TOKEN              the key for the private art (see scripts/fetch-art.mjs)
#   BUILD                  optional: the build number. Blank = one above the newest in TestFlight
#   PROFILE_NAME           optional: the App Store provisioning profile's name
#   IOS_PROFILE_B64        optional: that profile, base64. Blank = fetched by name with the API key
#   UPLOAD                 optional: 1 (default) uploads to TestFlight, 0 only builds and signs
#   XCODE_APP              optional: /Applications/Xcode_26.6.app (blank = the runner's default)
#
# The provisioning profile decides the team and the bundle id (both are read
# from it). The App target is set to manual signing with that profile.
# Signing settings are never passed on the xcodebuild command line, because
# that would apply them to the Swift packages too.
#
# Exit nonzero on any failure. Verbose on purpose.
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

: "${IOS_DIST_P12_B64:?IOS_DIST_P12_B64 is required}"
: "${IOS_DIST_P12_PASSWORD:?IOS_DIST_P12_PASSWORD is required}"
: "${ASC_API_KEY_ID:?ASC_API_KEY_ID is required}"
: "${ASC_API_ISSUER_ID:?ASC_API_ISSUER_ID is required}"
: "${ASC_API_KEY_B64:?ASC_API_KEY_B64 is required}"

# The app's Apple ID number in App Store Connect. Not a secret.
APP_STORE_ID="${APP_STORE_ID:-6834290285}"
PROFILE_WANTED="${PROFILE_NAME:-Campus Tycoon App Store}"
UPLOAD="${UPLOAD:-1}"
BUILD="${BUILD:-}"

WORK="${RUNNER_TEMP:-/tmp}/campus-ship"
rm -rf "$WORK"; mkdir -p "$WORK/logs"
LOG_DIR="$WORK/logs"
KEYCHAIN="$WORK/ship.keychain-db"
KEYCHAIN_PW="$(uuidgen)"
API_KEY_PATH="$HOME/private_keys/AuthKey_${ASC_API_KEY_ID}.p8"

cleanup() {
  # the certificate and the key never outlive the job
  security delete-keychain "$KEYCHAIN" 2>/dev/null || true
  rm -f "$WORK/dist.p12" "$API_KEY_PATH" 2>/dev/null || true
}
trap cleanup EXIT

echo "════════════════════════════════════════════════════════════"
echo "SHIP: Campus Tycoon iOS, from $(hostname)"
echo "════════════════════════════════════════════════════════════"

# ── 0. Xcode ─────────────────────────────────────────────────────────
if [ -n "${XCODE_APP:-}" ]; then
  echo "── [0] Selecting $XCODE_APP ──"
  sudo xcode-select -s "$XCODE_APP"
fi
xcodebuild -version
echo ""

# ── 1. The certificate, in a keychain of its own ─────────────────────
echo "── [1] Certificate → temporary keychain ──"
echo "$IOS_DIST_P12_B64" | base64 --decode > "$WORK/dist.p12"
security create-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN"
security import "$WORK/dist.p12" -k "$KEYCHAIN" -P "$IOS_DIST_P12_PASSWORD" -A -t cert -f pkcs12
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PW" "$KEYCHAIN" > /dev/null
EXISTING="$(security list-keychains -d user | tr -d '" ' | tr '\n' ' ')"
# shellcheck disable=SC2086
security list-keychains -d user -s "$KEYCHAIN" $EXISTING
echo "Signing identities in the keychain:"
security find-identity -v -p codesigning "$KEYCHAIN"
IDENTITY_COUNT="$(security find-identity -v -p codesigning "$KEYCHAIN" | grep -c 'Apple Distribution' || true)"
if [ "$IDENTITY_COUNT" = "0" ]; then
  echo "✖ No 'Apple Distribution' identity in the .p12."
  exit 1
fi
echo ""

# ── 2. The App Store Connect API key ─────────────────────────────────
echo "── [2] App Store Connect API key ──"
mkdir -p "$HOME/private_keys"
echo "$ASC_API_KEY_B64" | base64 --decode > "$API_KEY_PATH"
chmod 600 "$API_KEY_PATH"
export ASC_API_KEY_PATH="$API_KEY_PATH"
echo "  Key $ASC_API_KEY_ID, issuer ${ASC_API_ISSUER_ID:0:8}…"
echo ""

# ── 3. The provisioning profile ──────────────────────────────────────
echo "── [3] Provisioning profile ──"
if [ -n "${IOS_PROFILE_B64:-}" ]; then
  echo "  Given in the environment."
  echo "$IOS_PROFILE_B64" | base64 --decode > "$WORK/profile.mobileprovision"
else
  echo "  Fetching \"$PROFILE_WANTED\" from App Store Connect."
  node scripts/asc-api.mjs profile "$PROFILE_WANTED" > "$WORK/profile.b64"
  base64 --decode < "$WORK/profile.b64" > "$WORK/profile.mobileprovision"
fi
security cms -D -i "$WORK/profile.mobileprovision" > "$WORK/profile.plist"
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$WORK/profile.plist")"
PROFILE_NAME_READ="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$WORK/profile.plist")"
TEAM_ID="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$WORK/profile.plist")"
APP_IDENTIFIER="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$WORK/profile.plist")"
BUNDLE_ID="${APP_IDENTIFIER#"$TEAM_ID".}"
PROFILE_EXPIRES="$(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$WORK/profile.plist")"
echo "  Name:    $PROFILE_NAME_READ"
echo "  UUID:    $PROFILE_UUID"
echo "  Team:    $TEAM_ID"
echo "  Bundle:  $BUNDLE_ID"
echo "  Expires: $PROFILE_EXPIRES"
EXPECTED_BUNDLE="$(node -e "process.stdout.write(require('./capacitor.config.json').appId)")"
if [ "$BUNDLE_ID" != "$EXPECTED_BUNDLE" ]; then
  echo "✖ The profile is for $BUNDLE_ID, the app is $EXPECTED_BUNDLE. Wrong profile."
  exit 1
fi
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
cp "$WORK/profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
cp "$WORK/profile.mobileprovision" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
echo ""

# ── 4. The build number ──────────────────────────────────────────────
echo "── [4] Build number ──"
if [ -z "$BUILD" ]; then
  BUILD="$(node scripts/asc-api.mjs next-build "$APP_STORE_ID")"
  echo "  One above the newest build in TestFlight: $BUILD"
else
  echo "  Given: $BUILD"
fi
case "$BUILD" in
  '' | *[!0-9]*) echo "✖ The build number must be a whole number. Got \"$BUILD\"."; exit 1 ;;
esac
echo ""

# ── 5. The game, built into the app ──────────────────────────────────
echo "── [5] The game ──"
if [ -z "${ART_TOKEN:-}" ]; then
  if [ "$UPLOAD" = "1" ]; then
    echo "✖ ART_TOKEN is empty, so this build would carry the stand-in art. Not uploading that."
    echo "  Set the art key, or run with upload = 0 to try the build alone."
    exit 1
  fi
  echo "  ⚠ ART_TOKEN is empty: this build carries the stand-in art. It is not uploaded."
fi
npm run build:ios 2>&1 | tee "$LOG_DIR/web-build.log" | tail -40
node scripts/check-ios-bundle.mjs
node scripts/ios-version.mjs --build "$BUILD"
echo ""

# ── 6. Manual signing on the App target, with THIS profile ───────────
echo "── [6] App target → manual signing with '$PROFILE_NAME_READ' ──"
PROFILE_NAME_READ="$PROFILE_NAME_READ" TEAM_ID="$TEAM_ID" BUNDLE_ID="$BUNDLE_ID" ruby -e '
  require "xcodeproj"
  path = "ios/App/App.xcodeproj"
  proj = Xcodeproj::Project.open(path)
  target = proj.targets.find { |t| t.name == "App" } or abort("no App target")
  target.build_configurations.each do |config|
    config.build_settings["CODE_SIGN_STYLE"] = "Manual"
    config.build_settings["DEVELOPMENT_TEAM"] = ENV["TEAM_ID"]
    config.build_settings["PROVISIONING_PROFILE_SPECIFIER"] = ENV["PROFILE_NAME_READ"]
    config.build_settings["CODE_SIGN_IDENTITY"] = "Apple Distribution"
    config.build_settings["CODE_SIGN_IDENTITY[sdk=iphoneos*]"] = "Apple Distribution"
    config.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = ENV["BUNDLE_ID"]
    puts "  #{config.name}: Manual / #{ENV["TEAM_ID"]} / #{ENV["PROFILE_NAME_READ"]}"
  end
  attrs = proj.root_object.attributes["TargetAttributes"] ||= {}
  (attrs[target.uuid] ||= {})["ProvisioningStyle"] = "Manual"
  (attrs[target.uuid] ||= {})["DevelopmentTeam"] = ENV["TEAM_ID"]
  proj.save
  # The project carries no shared scheme. xcodebuild needs one to archive.
  shared = File.join(path, "xcshareddata", "xcschemes", "App.xcscheme")
  unless File.exist?(shared)
    scheme = Xcodeproj::XCScheme.new
    scheme.add_build_target(target)
    scheme.set_launch_target(target)
    scheme.save_as(path, "App", true)
    puts "  Shared scheme App written."
  end
'
echo ""

# ── 7. Archive ───────────────────────────────────────────────────────
echo "── [7] xcodebuild archive ──"
ARCHIVE="$WORK/App.xcarchive"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  archive 2>&1 | tee "$LOG_DIR/archive.log" | grep -E '^(\*\*|error:|.*: error:|warning: .*(entitlement|provisioning|signing)|Archive |=== |Build succeeded|Signing Identity|Provisioning Profile|Resolve Package|Fetching |Cloning )' || true
if [ ! -d "$ARCHIVE" ]; then
  echo "✖ No archive was produced. Every error line, then the last 60 lines of the log:"
  grep -n -E 'error:|error ' "$LOG_DIR/archive.log" | head -60 || true
  tail -60 "$LOG_DIR/archive.log"
  exit 1
fi
echo "  Archive: $ARCHIVE"
echo "  Version: $(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$ARCHIVE/Info.plist") ($(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$ARCHIVE/Info.plist"))"
echo ""

# ── 8. Export, and upload to App Store Connect (TestFlight) ──────────
if [ "$UPLOAD" = "1" ]; then DESTINATION="upload"; else DESTINATION="export"; fi
echo "── [8] Export ($DESTINATION) ──"
EXPORT_OPTS="$WORK/ExportOptions.plist"
cat > "$EXPORT_OPTS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$DESTINATION</string>
  <key>signingStyle</key><string>manual</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$BUNDLE_ID</key><string>$PROFILE_NAME_READ</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$EXPORT_OPTS" \
  -exportPath "$WORK/export" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$API_KEY_PATH" \
  -authenticationKeyID "$ASC_API_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_API_ISSUER_ID" \
  2>&1 | tee "$LOG_DIR/export.log" | grep -E '^(\*\*|error:|Upload|Exported|Packaging|Signing)' || true
if grep -qi 'EXPORT SUCCEEDED\|Upload succeeded\|UPLOAD SUCCEEDED' "$LOG_DIR/export.log"; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  if [ "$UPLOAD" = "1" ]; then
    echo "UPLOADED: build $BUILD is on its way to TestFlight (processing takes a few minutes)."
  else
    echo "BUILT AND SIGNED: build $BUILD was exported and not uploaded (upload = 0)."
  fi
  echo "════════════════════════════════════════════════════════════"
else
  echo "✖ The export did not report success. The last 80 lines of the log:"
  tail -80 "$LOG_DIR/export.log"
  exit 1
fi
