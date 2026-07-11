"""iOS-specific mutations + macOS-native archive/IPA build.

Runs the full prep pipeline on any OS (project.pbxproj + Info.plist mutations,
Firebase, entitlements). On macOS, additionally:

  * `npx cap sync ios`   — force Capacitor to re-sync the native project
  * `pod install`        — install CocoaPods dependencies
  * emit `build-ios.sh`  — one-liner archive → IPA script per tenant
  * (optional)           — run `xcodebuild archive` if the user passes
                           `--output archive` or `--output ipa`.
"""
from __future__ import annotations

import os
import platform
import plistlib
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .manifest import BuildManifest
from .utils import BuildError, has_command, log, run, section, write_text


@dataclass
class IosBuildParams:
    project_root: Path
    bundle_id: str
    app_name: str
    version_name: str
    version_code: int
    output: str = "prep"  # "prep" | "archive" | "ipa"


# ---------- project.pbxproj rewrites ----------
_PBX_BUNDLE_ID_RE = re.compile(r"(PRODUCT_BUNDLE_IDENTIFIER\s*=\s*)[^;\n]+;")
_PBX_TEAM_RE = re.compile(r"(DEVELOPMENT_TEAM\s*=\s*)[^;\n]+;")
_PBX_VERSION_RE = re.compile(r"(MARKETING_VERSION\s*=\s*)[^;\n]+;")
_PBX_BUILD_RE = re.compile(r"(CURRENT_PROJECT_VERSION\s*=\s*)[^;\n]+;")
_PBX_ENTITLEMENTS_RE = re.compile(r"(CODE_SIGN_ENTITLEMENTS\s*=\s*)[^;\n]+;")


def patch_pbxproj(p: IosBuildParams) -> None:
    pbx = p.project_root / "ios" / "App" / "App.xcodeproj" / "project.pbxproj"
    if not pbx.exists():
        log.warning(f"Skipping pbxproj patch — {pbx} not found. "
                    "On Linux, `cap add ios` requires cocoapods; the project is "
                    "prepared but iOS-native scaffolding must be finished on macOS.")
        return

    content = pbx.read_text()
    content = _PBX_BUNDLE_ID_RE.sub(f"\\g<1>{p.bundle_id};", content)
    content = _PBX_VERSION_RE.sub(f"\\g<1>{p.version_name};", content)
    content = _PBX_BUILD_RE.sub(f"\\g<1>{p.version_code};", content)

    # Ensure CODE_SIGN_ENTITLEMENTS points at our App/App.entitlements. Without
    # this, iOS ignores App.entitlements → push notifications capability is
    # effectively OFF regardless of what App.entitlements contains.
    entitlements_path = "App/App.entitlements"
    if _PBX_ENTITLEMENTS_RE.search(content):
        content = _PBX_ENTITLEMENTS_RE.sub(f"\\g<1>{entitlements_path};", content)
    else:
        # Insert next to every PRODUCT_BUNDLE_IDENTIFIER (each buildSettings block).
        content = _PBX_BUNDLE_ID_RE.sub(
            lambda m: m.group(0) + f"\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = {entitlements_path};",
            content,
        )

    team = os.environ.get("IOS_TEAM_ID", "").strip()
    if team:
        if _PBX_TEAM_RE.search(content):
            content = _PBX_TEAM_RE.sub(f"\\g<1>{team};", content)
        else:
            # Insert DEVELOPMENT_TEAM into each buildSettings block that has PRODUCT_BUNDLE_IDENTIFIER
            content = _PBX_BUNDLE_ID_RE.sub(
                lambda m: m.group(0) + f"\n\t\t\t\tDEVELOPMENT_TEAM = {team};",
                content,
            )
    pbx.write_text(content)
    log.info(f"Patched project.pbxproj: {p.bundle_id} v{p.version_name} ({p.version_code})"
             + (f" team={team}" if team else ""))


# ---------- Info.plist rewrites ----------
def patch_info_plist(p: IosBuildParams) -> None:
    info = p.project_root / "ios" / "App" / "App" / "Info.plist"
    if not info.exists():
        log.warning(f"Info.plist missing at {info} — skipping")
        return
    with info.open("rb") as f:
        data = plistlib.load(f)
    data["CFBundleDisplayName"] = p.app_name
    data["CFBundleName"] = p.app_name
    data["CFBundleShortVersionString"] = p.version_name
    data["CFBundleVersion"] = str(p.version_code)
    # Push notifications runtime background mode
    modes = set(data.get("UIBackgroundModes", []) or [])
    modes.add("remote-notification")
    data["UIBackgroundModes"] = sorted(modes)
    with info.open("wb") as f:
        plistlib.dump(data, f)
    log.info(f"Patched Info.plist: display='{p.app_name}' "
             f"v{p.version_name} build {p.version_code}")


# ---------- GoogleService-Info.plist ----------
def install_google_service_plist(project_root: Path, m: BuildManifest) -> bool:
    fb = m.firebase_ios or {}
    cfg = fb.get("config_plist") or fb.get("config_json")
    target = project_root / "ios" / "App" / "App" / "GoogleService-Info.plist"
    if not cfg:
        log.warning("No Firebase iOS config on tenant — push notifications "
                    "will be DISABLED on this iOS build.")
        return False
    write_text(target, cfg)
    log.info(f"Installed GoogleService-Info.plist ({len(cfg)} bytes) → {target}")
    return True


# ---------- iOS: Firebase Messaging integration ----------
FIREBASE_POD_MARKER = "# --- Injected by build_app.py: Firebase Messaging ---"


def install_firebase_pod(project_root: Path) -> bool:
    """Insert `pod 'Firebase/Messaging'` into ios/App/Podfile (idempotent).

    Required so the app can register with FCM and receive push notifications
    on iOS. The `@capacitor/push-notifications` plugin only wires APNs on iOS;
    Firebase Messaging is what converts APNs tokens → FCM tokens (the ones your
    backend + Firebase Console send to).
    """
    podfile = project_root / "ios" / "App" / "Podfile"
    if not podfile.exists():
        log.warning(f"{podfile} missing — cannot inject Firebase Messaging pod. "
                    "Finish `npx cap add ios` on macOS first.")
        return False
    content = podfile.read_text()
    if FIREBASE_POD_MARKER in content:
        return True  # already injected
    # Insert right after the "def capacitor_pods" opening or the first `target`.
    inject = (f"\n  {FIREBASE_POD_MARKER}\n"
              f"  pod 'Firebase/Messaging'\n")
    # Prefer to insert inside the target block that follows `capacitor_pods`.
    m = re.search(r"(target\s+'App'\s+do)", content)
    if not m:
        log.warning("Podfile has no `target 'App' do` block — skipping Firebase pod")
        return False
    idx = m.end()
    new_content = content[:idx] + inject + content[idx:]
    podfile.write_text(new_content)
    log.info(f"Added `pod 'Firebase/Messaging'` to {podfile}")
    return True


APPDELEGATE_MARKER = "// --- Injected by build_app.py: Firebase Messaging ---"


def patch_app_delegate(project_root: Path) -> bool:
    """Patch AppDelegate.swift to configure Firebase + forward APNs → FCM.

    Capacitor's default AppDelegate does not know about Firebase. We inject:
        - `import Firebase`
        - `FirebaseApp.configure()` inside `didFinishLaunchingWithOptions`
        - `Messaging.messaging().apnsToken = deviceToken` inside
          `didRegisterForRemoteNotificationsWithDeviceToken` so the APNs
          token is bridged to FCM.
    """
    ad = project_root / "ios" / "App" / "App" / "AppDelegate.swift"
    if not ad.exists():
        log.warning(f"{ad} missing — cannot patch AppDelegate. Finish `cap add ios` on macOS.")
        return False
    content = ad.read_text()
    if APPDELEGATE_MARKER in content:
        return True  # already patched

    # 1. Ensure `import Firebase`
    if "import Firebase" not in content:
        content = re.sub(r"(import UIKit\s*)",
                         r"\1\nimport Firebase   " + APPDELEGATE_MARKER + "\n",
                         content, count=1)

    # 2. FirebaseApp.configure() at the top of didFinishLaunching
    if "FirebaseApp.configure()" not in content:
        content = re.sub(
            r"(func application\(_[^{]*didFinishLaunchingWithOptions[^{]*\{)",
            r"\1\n        FirebaseApp.configure()   " + APPDELEGATE_MARKER,
            content, count=1,
        )

    # 3. Bridge APNs token to Firebase Messaging
    if "Messaging.messaging().apnsToken" not in content:
        # If the delegate already implements didRegisterForRemoteNotifications, inject inside;
        # else append a new function to the class.
        register_pat = r"(func application\(_[^{]*didRegisterForRemoteNotificationsWithDeviceToken[^{]*\{)"
        if re.search(register_pat, content):
            content = re.sub(
                register_pat,
                r"\1\n        Messaging.messaging().apnsToken = deviceToken   " + APPDELEGATE_MARKER,
                content, count=1,
            )
        else:
            # Append before the last closing brace of the class.
            inject = (
                "\n    " + APPDELEGATE_MARKER + "\n"
                "    func application(_ application: UIApplication,\n"
                "                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {\n"
                "        Messaging.messaging().apnsToken = deviceToken\n"
                "    }\n"
            )
            # Find last `}` in the file and inject before it.
            last_brace = content.rfind("}")
            if last_brace > 0:
                content = content[:last_brace] + inject + content[last_brace:]

    ad.write_text(content)
    log.info(f"Patched {ad}: FirebaseApp.configure + APNs→FCM bridge")
    return True


# ---------- macOS native tooling ----------
def _is_macos() -> bool:
    return sys.platform == "darwin" or platform.system() == "Darwin"


def cap_sync_ios(project_root: Path) -> None:
    """Force Capacitor to re-sync the iOS native project after our mutations."""
    npx = shutil.which("npx")
    if not npx:
        return
    log.info("Running `npx cap sync ios` to propagate config changes")
    run([npx, "cap", "sync", "ios"], cwd=project_root, check=False)


def pod_install(project_root: Path) -> None:
    """Install CocoaPods — required before Xcode can open the workspace."""
    if not has_command("pod"):
        log.warning("`pod` (CocoaPods) not found — skipping `pod install`. "
                    "Install with: sudo gem install cocoapods")
        return
    ios_app = project_root / "ios" / "App"
    if not (ios_app / "Podfile").exists():
        log.warning(f"No Podfile at {ios_app} — skipping pod install")
        return
    log.info(f"Running `pod install` in {ios_app}")
    run(["pod", "install"], cwd=ios_app)


# ---------- build-ios.sh emitter ----------
def _write_build_script(project_root: Path, p: IosBuildParams) -> Path:
    """Emit a per-tenant build-ios.sh that archives + exports an IPA."""
    script = project_root / "build-ios.sh"
    team = os.environ.get("IOS_TEAM_ID", "").strip()
    method = os.environ.get("IOS_EXPORT_METHOD", "app-store").strip()
    export_options_env = os.environ.get("IOS_EXPORT_OPTIONS_PLIST", "").strip()

    export_options_path = (project_root / "ExportOptions.plist")
    if not export_options_env and team:
        # Emit a sensible default ExportOptions.plist if the user didn't supply one.
        opts = {
            "method": method,
            "teamID": team,
            "signingStyle": "automatic",
            "stripSwiftSymbols": True,
            "uploadSymbols": True,
            "compileBitcode": False,
        }
        with export_options_path.open("wb") as f:
            plistlib.dump(opts, f)
        log.info(f"Wrote default ExportOptions.plist (method={method}, team={team})")
    export_options_flag = export_options_env or str(export_options_path)

    content = f"""#!/usr/bin/env bash
# GENERATED by build_app.py for tenant "{p.bundle_id}"
# One-command iOS archive + IPA export. Run this on macOS with Xcode installed.
set -euo pipefail

cd "$(dirname "$0")"

WORKSPACE="ios/App/App.xcworkspace"
SCHEME="App"
CONFIG="Release"
ARCHIVE_PATH="build/{p.bundle_id}-{p.version_name}-{p.version_code}.xcarchive"
IPA_PATH="build/ipa"
EXPORT_OPTIONS="{export_options_flag}"

echo "▶ Cleaning previous archives"
rm -rf build && mkdir -p build

echo "▶ Archiving (Release, iphoneos)"
xcodebuild archive \\
  -workspace "$WORKSPACE" \\
  -scheme "$SCHEME" \\
  -configuration "$CONFIG" \\
  -destination "generic/platform=iOS" \\
  -archivePath "$ARCHIVE_PATH" \\
  -allowProvisioningUpdates \\
  MARKETING_VERSION="{p.version_name}" \\
  CURRENT_PROJECT_VERSION="{p.version_code}"

if [ ! -f "$EXPORT_OPTIONS" ]; then
  echo "⚠ ExportOptions.plist not found at $EXPORT_OPTIONS — stopping after archive."
  echo "  Open the .xcarchive in Xcode → Window → Organizer → Distribute App."
  exit 0
fi

echo "▶ Exporting IPA"
xcodebuild -exportArchive \\
  -archivePath "$ARCHIVE_PATH" \\
  -exportOptionsPlist "$EXPORT_OPTIONS" \\
  -exportPath "$IPA_PATH" \\
  -allowProvisioningUpdates

IPA=$(find "$IPA_PATH" -name "*.ipa" | head -n 1)
echo ""
echo "✅  IPA ready: $IPA"
"""
    script.write_text(content)
    script.chmod(0o755)
    log.info(f"Emitted {script} (chmod +x)")
    return script


def xcodebuild_archive(project_root: Path, p: IosBuildParams) -> Optional[Path]:
    """Run the emitted build-ios.sh (if xcodebuild available). Returns the IPA path."""
    if not has_command("xcodebuild"):
        log.warning("xcodebuild not found — skipping iOS compile. Open the "
                    "workspace in Xcode or run build-ios.sh manually on a Mac.")
        return None
    script = project_root / "build-ios.sh"
    if not script.exists():
        log.warning(f"{script} not present — cannot compile")
        return None
    section("iOS: xcodebuild archive + export")
    run([str(script)], cwd=project_root)
    ipa_dir = project_root / "build" / "ipa"
    ipas = list(ipa_dir.glob("*.ipa")) if ipa_dir.exists() else []
    if ipas:
        log.info(f"✅ IPA: {ipas[0]}")
        return ipas[0]
    xcarchives = list((project_root / "build").glob("*.xcarchive"))
    if xcarchives:
        log.info(f"✅ .xcarchive: {xcarchives[0]} (open in Xcode Organizer to distribute)")
        return xcarchives[0]
    return None


# ---------- Orchestration ----------
def apply_all(m: BuildManifest, p: IosBuildParams) -> Optional[Path]:
    section("iOS: applying tenant branding")
    install_google_service_plist(p.project_root, m)

    # On macOS, sync the native project first so pbxproj + Info.plist actually
    # exist to patch. On Linux, `cap add ios` silently no-ops so these are absent.
    if _is_macos():
        cap_sync_ios(p.project_root)
        # Inject Firebase Messaging pod BEFORE `pod install` so it's fetched.
        install_firebase_pod(p.project_root)
        pod_install(p.project_root)

    patch_pbxproj(p)
    patch_info_plist(p)
    # Firebase bridging in AppDelegate (works whether on macOS or Linux —
    # AppDelegate.swift is created by `cap add ios`, which may be Linux-scaffolded).
    patch_app_delegate(p.project_root)

    # Entitlements — write if the App folder exists (i.e. cap add ios worked).
    # `aps-environment` is required for the app to receive push notifications
    # from APNs. Defaults to "production" (works for both TestFlight and App
    # Store); override via IOS_APS_ENVIRONMENT=development for pre-release
    # sandbox APNs testing.
    app_folder = p.project_root / "ios" / "App" / "App"
    if app_folder.exists():
        aps_env = os.environ.get("IOS_APS_ENVIRONMENT", "production").strip() or "production"
        ent = app_folder / "App.entitlements"
        with ent.open("wb") as f:
            plistlib.dump({"aps-environment": aps_env}, f)
        log.info(f"Wrote {ent} (aps-environment={aps_env})")

    # Always emit build-ios.sh so the user has a CLI path.
    _write_build_script(p.project_root, p)

    if p.output in ("archive", "ipa") and _is_macos():
        return xcodebuild_archive(p.project_root, p)

    if p.output in ("archive", "ipa") and not _is_macos():
        log.warning(f"--output {p.output} requires macOS + Xcode. "
                    "Falling back to prep-only.")

    log.info("iOS prep complete. Open ios/App/App.xcworkspace in Xcode "
             "OR run ./build-ios.sh from this folder for a CLI archive+IPA.")
    return None
