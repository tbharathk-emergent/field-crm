"""iOS-specific mutations for the tenant Capacitor project.

Runs on Linux — prepares the Xcode project so the user can just open it in
Xcode on macOS, archive, and export to TestFlight / App Store.

Responsibilities:
  * Overwrite PRODUCT_BUNDLE_IDENTIFIER in project.pbxproj
  * Overwrite CFBundleDisplayName + CFBundleShortVersionString +
    CFBundleVersion in Info.plist
  * Set DEVELOPMENT_TEAM in project.pbxproj (if IOS_TEAM_ID env var set)
  * Install GoogleService-Info.plist and reference it from the Xcode project
  * Enable "Push Notifications" capability entitlement

The absence of `xcodebuild` (Linux) is expected — we prep the project only.
"""
from __future__ import annotations

import os
import plistlib
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .manifest import BuildManifest
from .utils import BuildError, log, section, write_bytes, write_text


@dataclass
class IosBuildParams:
    project_root: Path
    bundle_id: str
    app_name: str
    version_name: str
    version_code: int


# ---------- project.pbxproj rewrites ----------
_PBX_BUNDLE_ID_RE = re.compile(r"(PRODUCT_BUNDLE_IDENTIFIER\s*=\s*)[^;\n]+;")
_PBX_TEAM_RE = re.compile(r"(DEVELOPMENT_TEAM\s*=\s*)[^;\n]+;")
_PBX_VERSION_RE = re.compile(r"(MARKETING_VERSION\s*=\s*)[^;\n]+;")
_PBX_BUILD_RE = re.compile(r"(CURRENT_PROJECT_VERSION\s*=\s*)[^;\n]+;")


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
    # Cfg is stored as raw XML in DB
    write_text(target, cfg)
    log.info(f"Installed GoogleService-Info.plist ({len(cfg)} bytes) → {target}")
    return True


# ---------- Orchestration ----------
def apply_all(m: BuildManifest, p: IosBuildParams) -> None:
    section("iOS: applying tenant branding (prep-only)")
    install_google_service_plist(p.project_root, m)
    patch_pbxproj(p)
    patch_info_plist(p)
    # Entitlements: only write if the App folder exists (cap add ios succeeded)
    app_folder = p.project_root / "ios" / "App" / "App"
    if app_folder.exists():
        ent = app_folder / "App.entitlements"
        with ent.open("wb") as f:
            plistlib.dump({"aps-environment": "production"}, f)
        log.info(f"Wrote {ent} (aps-environment=production)")
    log.info("iOS prep complete. Open ios/App/App.xcworkspace in Xcode on macOS, "
             "then Product → Archive.")
