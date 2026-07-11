#!/usr/bin/env python3
"""FieldCRM — per-tenant Capacitor build orchestrator.

Usage:
    python3 build_app.py \
        --tenant <slug> \
        --platform <android|ios> \
        --version <x.y.z> \
        --version-code <int> \
        [--output apk|aab]        # Android only. Default apk.
        [--backend-url URL]        # Default: $BACKEND_URL or REACT_APP_BACKEND_URL
        [--out-dir DIR]            # Override /app/dist/tenants/<slug>
        [--force-rebuild]          # Force `yarn build` even if /app/frontend/build exists
        [--prep-only]              # Skip gradle compile (Android). iOS is always prep.
        [--verbose]

Env vars:
    BACKEND_URL              e.g. https://api.fieldcrm.app  (or REACT_APP_BACKEND_URL)
    SUPER_ADMIN_PHONE        default 9858558555 (mock OTP flow)
    SUPER_ADMIN_OTP          default 557725
    SUPER_ADMIN_TOKEN        override — use pre-obtained JWT
    ANDROID_HOME             Android SDK path (required for `--output apk|aab` compile)
    ANDROID_KEYSTORE_PATH    Release keystore (AAB signing)
    ANDROID_KEYSTORE_PASSWORD
    ANDROID_KEY_ALIAS
    ANDROID_KEY_PASSWORD
    IOS_TEAM_ID              Apple Developer team ID (10-char)
    IOS_BUNDLE_PREFIX        Override default `in.localappstore.fieldcrm`
    BUILD_OUT_ROOT           Override output dir base (default /app/dist/tenants)

Examples:
    # Full Android debug APK for tenant 'demo' (requires ANDROID_HOME):
    python3 build_app.py --tenant demo --platform android \
        --version 1.0.0 --version-code 1 --output apk

    # Release AAB (Play Store):
    python3 build_app.py --tenant acme --platform android \
        --version 2.4.1 --version-code 41 --output aab

    # iOS project prep (open in Xcode):
    python3 build_app.py --tenant demo --platform ios \
        --version 1.0.0 --version-code 1
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app")

from build_system import android as android_mod
from build_system import assets, capacitor, ios as ios_mod, manifest as manifest_mod
from build_system.utils import (
    configure_logging, default_bundle_id, ensure_dir, log, parse_color, section,
)


def _resolve_backend_url(cli_url: str | None) -> str:
    if cli_url:
        return cli_url.rstrip("/")
    for key in ("BACKEND_URL", "REACT_APP_BACKEND_URL"):
        v = os.environ.get(key)
        if v:
            return v.rstrip("/")
    # Try /app/frontend/.env fallback
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise SystemExit("BACKEND_URL not set — pass --backend-url or export it")


def _parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="FieldCRM per-tenant Capacitor build",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Examples:")[1] if "Examples:" in __doc__ else "",
    )
    ap.add_argument("--tenant", required=True, help="Tenant slug (e.g. 'demo', 'acme')")
    ap.add_argument("--platform", required=True, choices=["android", "ios"])
    ap.add_argument("--version", required=True, help="Marketing version (e.g. 1.2.3)")
    ap.add_argument("--version-code", required=True, type=int, dest="version_code",
                    help="Integer build number (e.g. 41)")
    ap.add_argument("--output", choices=["apk", "aab", "prep"], default="apk",
                    help="Android only. apk (debug, sideloadable) | aab (release, Play Store) | prep (no compile)")
    ap.add_argument("--backend-url", default=None,
                    help="Override backend URL (defaults to $BACKEND_URL / REACT_APP_BACKEND_URL)")
    ap.add_argument("--super-token", default=None,
                    help="Pre-obtained super admin JWT (skips OTP flow)")
    ap.add_argument("--super-phone", default=None, help="Override super admin phone")
    ap.add_argument("--super-otp", default=None, help="Override super admin OTP")
    ap.add_argument("--out-dir", default=None, type=Path,
                    help="Override output directory (default /app/dist/tenants/<slug>)")
    ap.add_argument("--force-rebuild", action="store_true",
                    help="Re-run `yarn build` even if /app/frontend/build exists")
    ap.add_argument("--prep-only", action="store_true",
                    help="Skip gradle compile even if Android SDK is available")
    ap.add_argument("--verbose", "-v", action="store_true")
    return ap.parse_args()


def main() -> int:
    args = _parse_args()
    configure_logging(args.verbose)

    backend_url = _resolve_backend_url(args.backend_url)
    log.info(f"Backend URL: {backend_url}")

    # -------- 1. Fetch tenant manifest --------
    section(f"1/6 Fetching build manifest for '{args.tenant}'")
    m = manifest_mod.load(
        backend_url=backend_url,
        slug=args.tenant,
        token=args.super_token,
        super_phone=args.super_phone,
        super_otp=args.super_otp,
    )
    log.info(f"Tenant: {m.name} ({m.tenant['id']}) | primary={m.theme_primary}")
    if args.verbose:
        log.debug(manifest_mod.to_debug_json(m))

    # -------- 2. Derive naming --------
    bundle_prefix = os.environ.get("IOS_BUNDLE_PREFIX", "in.localappstore.fieldcrm")
    bundle_id = default_bundle_id(m.slug, prefix=bundle_prefix)
    app_name = m.name or f"FieldCRM {m.slug}"
    primary = parse_color(m.theme_primary)
    log.info(f"App name : {app_name}")
    log.info(f"Bundle ID: {bundle_id}")

    # -------- 3. Prepare project directory + web bundle --------
    out_root = args.out_dir or capacitor.out_dir_for(m.slug)
    ensure_dir(out_root)
    section(f"2/6 Preparing project at {out_root}")

    frontend_dir = Path(os.environ.get("FRONTEND_DIR", "/app/frontend"))
    capacitor.copy_web_bundle(frontend_dir, out_root / "webapp",
                              force_rebuild=args.force_rebuild)

    # Save the tenant.json for reproducibility (redacted logo)
    dbg = json.loads(manifest_mod.to_debug_json(m))
    (out_root / "tenant.json").write_text(json.dumps(dbg, indent=2))

    # -------- 4. Emit capacitor.config.ts + package.json + install --------
    section("3/6 Writing capacitor.config.ts + package.json")
    capacitor.write_capacitor_config(
        out_root, m, bundle_id=bundle_id, app_name=app_name,
        server_url=(f"https://{m.server_host}" if m.server_host else None),
    )
    capacitor.write_package_json(out_root, m.slug)

    section("4/6 Installing Capacitor + adding platform")
    capacitor.install_and_bootstrap(out_root, args.platform)

    # -------- 5. Generate icons + splash --------
    section("5/6 Generating icons + splash from tenant logo")
    android_res, ios_appicon, splash_dir, playstore_icon = assets.prepare_dirs(out_root)
    assets.generate_all(
        logo_bytes=m.logo_bytes,
        primary_hex=primary,
        android_res_dir=android_res,
        ios_appicon_dir=ios_appicon,
        splash_out_dir=splash_dir,
        playstore_icon_path=playstore_icon,
    )
    splash_source = splash_dir / "splash.png"

    # -------- 6. Platform-specific mutations + compile --------
    section(f"6/6 Applying {args.platform} branding")
    artifact = None
    if args.platform == "android":
        output = "prep" if args.prep_only else args.output
        p = android_mod.AndroidBuildParams(
            project_root=out_root,
            bundle_id=bundle_id,
            app_name=app_name,
            version_name=args.version,
            version_code=args.version_code,
            output=output,
        )
        artifact = android_mod.apply_all(m, p, splash_source=splash_source)
    else:
        p = ios_mod.IosBuildParams(
            project_root=out_root,
            bundle_id=bundle_id,
            app_name=app_name,
            version_name=args.version,
            version_code=args.version_code,
        )
        ios_mod.apply_all(m, p)

    # -------- Done --------
    section("Build complete")
    print("")
    print("╔═══════════════════════════════════════════════════════════════════════╗")
    print(f"║  ✅  Tenant '{m.slug}' Capacitor project ready".ljust(72) + "║")
    print("╚═══════════════════════════════════════════════════════════════════════╝")
    print(f"  App name    : {app_name}")
    print(f"  Bundle ID   : {bundle_id}")
    print(f"  Version     : {args.version} ({args.version_code})")
    print(f"  Project dir : {out_root}")
    if args.platform == "android":
        print(f"  Android SDK : {os.environ.get('ANDROID_HOME', '(not set)')}")
        if artifact:
            print(f"  🎯 Artifact : {artifact}")
        else:
            print(f"  Next step   : cd {out_root}/android && ./gradlew "
                  f"{'assembleDebug' if (args.output == 'apk') else 'bundleRelease'}")
    else:
        print(f"  Next step   : Open {out_root}/ios/App/App.xcworkspace on your Mac in Xcode")
    print("")
    return 0


if __name__ == "__main__":
    sys.exit(main())
