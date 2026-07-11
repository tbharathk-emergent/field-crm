"""Android-specific mutations for the tenant Capacitor project.

Applied AFTER `npx cap add android` has scaffolded `<project>/android/`.

Responsibilities:
  * Overwrite `applicationId` and `versionName` / `versionCode` in
    `android/app/build.gradle`.
  * Inject Firebase (google-services.json + apply Google-Services plugin +
    Firebase Messaging dependency).
  * Rewrite the app's display name in `res/values/strings.xml`.
  * Inject signing config (release AAB) from env vars — falls back to the
    debug keystore for APK builds so devices can install without publisher
    setup.
  * Run `./gradlew assembleDebug` for APK or `bundleRelease` for AAB.
"""
from __future__ import annotations

import base64
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .manifest import BuildManifest
from .utils import (
    BuildError, ensure_dir, has_command, log, run, sanitize_app_name,
    section, write_bytes, write_text,
)


@dataclass
class AndroidBuildParams:
    project_root: Path
    bundle_id: str
    app_name: str
    version_name: str
    version_code: int
    output: str  # "apk" | "aab" | "prep"
    release: bool = False  # apk: debug vs release; ignored for aab (always release)


# ---------- build.gradle rewrites ----------
_APPLICATION_ID_RE = re.compile(r'applicationId\s+"[^"]*"')
_VERSION_NAME_RE = re.compile(r'versionName\s+"[^"]*"')
_VERSION_CODE_RE = re.compile(r"versionCode\s+\d+")


def patch_app_build_gradle(p: AndroidBuildParams) -> None:
    gradle = p.project_root / "android" / "app" / "build.gradle"
    if not gradle.exists():
        raise BuildError(f"Missing {gradle} — did `cap add android` fail?")
    content = gradle.read_text()

    content = _APPLICATION_ID_RE.sub(f'applicationId "{p.bundle_id}"', content, count=1)
    content = _VERSION_NAME_RE.sub(f'versionName "{p.version_name}"', content, count=1)
    content = _VERSION_CODE_RE.sub(f"versionCode {p.version_code}", content, count=1)

    # Apply google-services plugin if a google-services.json is present.
    gs_json = p.project_root / "android" / "app" / "google-services.json"
    if gs_json.exists() and "com.google.gms.google-services" not in content:
        # Append after the existing `apply plugin: 'com.android.application'` line
        content = re.sub(
            r"apply plugin:\s*'com\.android\.application'",
            ("apply plugin: 'com.android.application'\n"
             "apply plugin: 'com.google.gms.google-services'"),
            content, count=1,
        )

    # Firebase Messaging dependency (idempotent)
    if "firebase-messaging" not in content:
        content = re.sub(
            r"dependencies\s*\{",
            ("dependencies {\n"
             "    implementation platform('com.google.firebase:firebase-bom:33.3.0')\n"
             "    implementation 'com.google.firebase:firebase-messaging'\n"),
            content, count=1,
        )

    # Inject signing config from env (if provided) → replace defaults
    signing_block = _release_signing_block()
    if signing_block:
        # If a `signingConfigs` block already exists, replace it; else insert.
        sc_re = re.compile(r"signingConfigs\s*\{[^}]*\}", re.DOTALL)
        if sc_re.search(content):
            content = sc_re.sub(signing_block.strip(), content, count=1)
        else:
            content = re.sub(r"android\s*\{",
                             f"android {{\n    {signing_block.strip()}",
                             content, count=1)
        # Attach signingConfig to release buildType — replace any existing line
        content = re.sub(
            r"buildTypes\s*\{\s*release\s*\{[^}]*\}",
            ("buildTypes {\n        release {\n"
             "            minifyEnabled false\n"
             "            signingConfig signingConfigs.release\n"
             "            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'\n"
             "        }"),
            content, count=1, flags=re.DOTALL,
        )

    gradle.write_text(content)
    log.info(f"Patched {gradle.name}: applicationId={p.bundle_id}, "
             f"versionName={p.version_name}, versionCode={p.version_code}")


def _release_signing_block() -> Optional[str]:
    ks_path = os.environ.get("ANDROID_KEYSTORE_PATH")
    if not ks_path:
        return None
    ks_pwd = os.environ.get("ANDROID_KEYSTORE_PASSWORD", "")
    key_alias = os.environ.get("ANDROID_KEY_ALIAS", "release")
    key_pwd = os.environ.get("ANDROID_KEY_PASSWORD", ks_pwd)
    return f"""signingConfigs {{
        release {{
            storeFile file("{ks_path}")
            storePassword "{ks_pwd}"
            keyAlias "{key_alias}"
            keyPassword "{key_pwd}"
        }}
    }}"""


# ---------- Google Services / Firebase Messaging ----------
def _root_build_gradle_needs_gs(root_gradle: Path) -> bool:
    return "com.google.gms:google-services" not in root_gradle.read_text()


def patch_root_build_gradle(project_root: Path) -> None:
    root_gradle = project_root / "android" / "build.gradle"
    if not root_gradle.exists():
        return
    if _root_build_gradle_needs_gs(root_gradle):
        content = root_gradle.read_text()
        # buildscript > dependencies block
        content = re.sub(
            r"(buildscript\s*\{[^}]*dependencies\s*\{)",
            (r"\1\n        classpath 'com.google.gms:google-services:4.4.2'"),
            content, count=1, flags=re.DOTALL,
        )
        root_gradle.write_text(content)
        log.info("Added google-services classpath to android/build.gradle")


def install_google_services_json(project_root: Path, m: BuildManifest) -> bool:
    """Return True if a real google-services.json was installed."""
    fb = m.firebase_android or {}
    cfg = fb.get("config_json")
    target = project_root / "android" / "app" / "google-services.json"
    if not cfg:
        log.warning("No Firebase Android config on tenant — push notifications "
                    "will be DISABLED on this Android build.")
        return False
    write_text(target, cfg)
    log.info(f"Installed google-services.json ({len(cfg)} bytes) → {target}")
    return True


# ---------- strings.xml (display name) ----------
def patch_display_name(project_root: Path, app_name: str) -> None:
    strings = (project_root / "android" / "app" / "src" / "main" /
               "res" / "values" / "strings.xml")
    if not strings.exists():
        return
    safe = sanitize_app_name(app_name)
    xml = strings.read_text()
    for key in ("app_name", "title_activity_main"):
        xml = re.sub(
            rf'(<string name="{key}">)[^<]*(</string>)',
            rf"\g<1>{safe}\g<2>",
            xml,
        )
    strings.write_text(xml)
    log.info(f"Set Android app display name → {app_name}")


# ---------- AndroidManifest.xml — push notification permission ----------
POST_NOTIF_PERM = ('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
                   '  <!-- Android 13+ notifications: injected by build_app.py -->')


def patch_android_manifest(project_root: Path) -> None:
    """Ensure POST_NOTIFICATIONS is declared (mandatory on Android 13+ / API 33+).

    Also declares the default notification channel so foreground messages are
    routed correctly by Capacitor's PushNotifications plugin.
    """
    manifest = (project_root / "android" / "app" / "src" / "main" /
                "AndroidManifest.xml")
    if not manifest.exists():
        return
    xml = manifest.read_text()
    if "android.permission.POST_NOTIFICATIONS" not in xml:
        xml = re.sub(
            r"(<manifest[^>]*>)",
            r"\1\n    " + POST_NOTIF_PERM,
            xml, count=1,
        )
        manifest.write_text(xml)
        log.info(f"Added POST_NOTIFICATIONS permission to {manifest.name}")


# ---------- Splash setup ----------
def install_splash(project_root: Path, splash_source: Path) -> None:
    """Copy splash.png into every drawable-* density folder."""
    if not splash_source.exists():
        return
    res_dir = project_root / "android" / "app" / "src" / "main" / "res"
    for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
        out = res_dir / f"drawable-{density}"
        ensure_dir(out)
        shutil.copy(splash_source, out / "splash.png")
    ensure_dir(res_dir / "drawable")
    shutil.copy(splash_source, res_dir / "drawable" / "splash.png")


# ---------- Compile ----------
def gradle_build(p: AndroidBuildParams) -> Optional[Path]:
    """Run gradle to produce APK (debug) or AAB (release). Returns artifact path.

    Silently returns None if `output == 'prep'` or Android SDK is not available.
    """
    output = p.output
    if output == "prep":
        log.info("Skipping gradle build (output=prep). Open android/ in Android Studio.")
        return None

    android_dir = p.project_root / "android"
    gradlew = android_dir / "gradlew"
    if not gradlew.exists():
        raise BuildError(f"{gradlew} missing — did `cap add android` finish?")
    gradlew.chmod(0o755)

    if not (os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")):
        log.warning("ANDROID_HOME / ANDROID_SDK_ROOT not set — skipping gradle compile.")
        log.warning("Set ANDROID_HOME to your Android SDK path and re-run "
                    "with the same args to actually compile.")
        return None

    if output == "apk":
        if p.release:
            if not os.environ.get("ANDROID_KEYSTORE_PATH"):
                log.warning("ANDROID_KEYSTORE_PATH not set — the release APK will be UNSIGNED "
                            "(app-release-unsigned.apk). Sign it manually with apksigner or "
                            "set ANDROID_KEYSTORE_PATH in build.env for auto-signing.")
            target = "assembleRelease"
            artifact_glob = "app/build/outputs/apk/release/*.apk"
        else:
            target = "assembleDebug"
            artifact_glob = "app/build/outputs/apk/debug/*.apk"
    elif output == "aab":
        if not os.environ.get("ANDROID_KEYSTORE_PATH"):
            log.warning("ANDROID_KEYSTORE_PATH not set — the AAB will be UNSIGNED.")
        target = "bundleRelease"
        artifact_glob = "app/build/outputs/bundle/release/*.aab"
    else:
        raise BuildError(f"Unknown Android output: {output}")

    section(f"Gradle: {target}")
    run([str(gradlew), target, "--no-daemon"], cwd=android_dir)

    artifacts = sorted(android_dir.glob(artifact_glob))
    if not artifacts:
        raise BuildError(f"gradle succeeded but no artifact matched {artifact_glob}")
    log.info(f"✅ Artifact: {artifacts[0]}")
    return artifacts[0]


# ---------- Orchestration ----------
def apply_all(m: BuildManifest, p: AndroidBuildParams,
              splash_source: Optional[Path] = None) -> Optional[Path]:
    section("Android: applying tenant branding")
    install_google_services_json(p.project_root, m)
    patch_root_build_gradle(p.project_root)
    patch_app_build_gradle(p)
    patch_display_name(p.project_root, p.app_name)
    patch_android_manifest(p.project_root)
    if splash_source:
        install_splash(p.project_root, splash_source)
    return gradle_build(p)
