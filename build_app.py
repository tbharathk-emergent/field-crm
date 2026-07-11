#!/usr/bin/env python3
"""FieldCRM — per-tenant Capacitor build orchestrator.

Usage:
    # Discover available tenants
    python3 build_app.py --list-tenants

    # Build for a tenant
    python3 build_app.py \\
        --tenant <slug> \\
        --platform <android|ios> \\
        --version <x.y.z> \\
        --version-code <int> \\
        [--output apk|aab]        # Android only. Default apk.
        [--env-file PATH]          # Default ./build.env or /app/build.env
        [--verbose]

The script reads its configuration from a dedicated `build.env` file — the
FastAPI server's `/app/backend/.env` is NOT consulted. Copy
`/app/build.env.example` → `/app/build.env` and fill in your values.

Firebase config files are fetched automatically from Super Admin per tenant and
placed into `android/app/google-services.json` +
`ios/App/App/GoogleService-Info.plist`. Any stale Firebase files from a
previous build of the same tenant are wiped first.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

# Resolve absolute path of the script so imports + defaults work regardless of
# the user's current working directory or platform (Linux dev pod vs macOS).
_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))

from build_system import android as android_mod
from build_system import assets, capacitor, ios as ios_mod, manifest as manifest_mod
from build_system.utils import (
    configure_logging, default_bundle_id, ensure_dir, load_env_file, log,
    parse_color, section,
)


# --------------------------------------------------------------------------
# env-file discovery + argparse
# --------------------------------------------------------------------------
def _find_default_env_file() -> Path | None:
    """Look for build.env next to this script, then at CWD, then /app."""
    for cand in (_SCRIPT_DIR / "build.env",
                 Path.cwd() / "build.env",
                 Path("/app/build.env")):
        if cand.exists():
            return cand
    return None


def _resolve_frontend_dir() -> Path:
    """Default frontend location: sibling of build_app.py → override via FRONTEND_DIR."""
    override = os.environ.get("FRONTEND_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return _SCRIPT_DIR / "frontend"


def _resolve_backend_url(cli_url: str | None) -> str:
    """Priority: --backend-url > API_BASE_URL > BACKEND_URL > REACT_APP_BACKEND_URL."""
    if cli_url:
        return cli_url.rstrip("/")
    for key in ("API_BASE_URL", "BACKEND_URL", "REACT_APP_BACKEND_URL"):
        v = os.environ.get(key)
        if v:
            return v.rstrip("/")
    # Last resort — read from frontend/.env sibling of this script
    for env_file in (_SCRIPT_DIR / "frontend" / ".env",
                     Path("/app/frontend/.env")):
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise SystemExit(
        "No backend URL — set API_BASE_URL in build.env, or pass --backend-url"
    )


def _parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        prog="build_app.py",
        description="FieldCRM per-tenant Capacitor build",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--env-file", type=Path, default=None,
                    help="Path to build env file (default: ./build.env or /app/build.env)")
    ap.add_argument("--list-tenants", action="store_true",
                    help="Print all tenants (id / slug / name) and exit")

    ap.add_argument("--tenant", help="Tenant slug (e.g. 'demo', 'acme')")
    ap.add_argument("--platform", choices=["android", "ios"],
                    help="Build target platform")
    ap.add_argument("--version", help="Marketing version (e.g. 1.2.3)")
    ap.add_argument("--version-code", type=int, dest="version_code",
                    help="Integer build number (e.g. 41)")
    ap.add_argument("--output", choices=["apk", "aab", "archive", "ipa", "prep"], default="apk",
                    help="Android: apk (debug) | aab (release) | prep (no compile). "
                         "iOS: archive (.xcarchive) | ipa (signed IPA) | prep (default).")
    ap.add_argument("--release", action="store_true",
                    help="Android only. With --output apk, produces a release-signed APK "
                         "(uses ANDROID_KEYSTORE_*). Ignored for --output aab (always release).")

    ap.add_argument("--backend-url", default=None,
                    help="Override API URL (default from env: API_BASE_URL)")
    ap.add_argument("--super-token", default=None,
                    help="Pre-obtained super admin JWT (skips OTP)")
    ap.add_argument("--super-phone", default=None)
    ap.add_argument("--super-otp", default=None)
    ap.add_argument("--out-dir", default=None, type=Path,
                    help="Override output directory (default $OUTPUT_DIR/<slug>)")
    ap.add_argument("--verbose", "-v", action="store_true")
    return ap.parse_args()


def _validate_build_args(args: argparse.Namespace) -> None:
    missing = [name for name in ("tenant", "platform", "version", "version_code")
               if getattr(args, name) in (None, "")]
    if missing:
        raise SystemExit(
            "Missing required build args: " + ", ".join(f"--{m.replace('_', '-')}" for m in missing)
        )


# --------------------------------------------------------------------------
# Subcommand: --list-tenants
# --------------------------------------------------------------------------
def cmd_list_tenants(backend_url: str, args: argparse.Namespace) -> int:
    tenants = manifest_mod.list_tenants(
        backend_url=backend_url,
        token=args.super_token,
        super_phone=args.super_phone,
        super_otp=args.super_otp,
    )
    if not tenants:
        print("No tenants found.")
        return 0

    # Neatly formatted table.
    hdr_slug = "SLUG"
    hdr_name = "NAME"
    hdr_type = "TYPE"
    hdr_status = "STATUS"
    hdr_stats = "USERS (emp/dlr/cust)"
    slug_w = max(len(hdr_slug), max(len(t.get("slug") or "") for t in tenants))
    name_w = max(len(hdr_name), max(len(t.get("name") or "") for t in tenants))
    type_w = max(len(hdr_type), max(len(t.get("business_type") or "") for t in tenants))

    row_fmt = f"  {{:<{slug_w}}}  {{:<{name_w}}}  {{:<{type_w}}}  {{:<10}}  {{}}"
    print("")
    print(row_fmt.format(hdr_slug, hdr_name, hdr_type, hdr_status, hdr_stats))
    print("  " + "-" * (slug_w + name_w + type_w + 10 + len(hdr_stats) + 8))
    for t in tenants:
        stats = t.get("stats") or {}
        stat_str = f"{stats.get('employees', 0)}/{stats.get('dealers', 0)}/{stats.get('customers', 0)}"
        status = "active" if t.get("is_active", True) else "inactive"
        print(row_fmt.format(
            t.get("slug") or "-",
            (t.get("name") or "-")[:name_w],
            t.get("business_type") or "-",
            status,
            stat_str,
        ))
    print(f"\n  Total: {len(tenants)} tenant(s)")
    print("\n  Build with:  python3 build_app.py --tenant <SLUG> --platform android "
          "--version 1.0.0 --version-code 1\n")
    return 0


# --------------------------------------------------------------------------
# Subcommand: build for one tenant
# --------------------------------------------------------------------------
def cmd_build_tenant(backend_url: str, args: argparse.Namespace) -> int:
    _validate_build_args(args)

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

    # -------- 3. WIPE + prepare project dir  --------
    out_root = args.out_dir or capacitor.out_dir_for(m.slug)
    if out_root.exists():
        log.info(f"Wiping previous project at {out_root} (guarantee tenant isolation)")
        shutil.rmtree(out_root)
    ensure_dir(out_root)
    section(f"2/6 Preparing project at {out_root}")

    # Web bundle: rebuild React with tenant-specific env baked in.
    frontend_dir = _resolve_frontend_dir()
    if not frontend_dir.exists():
        raise SystemExit(
            f"Frontend directory not found: {frontend_dir}\n"
            f"  → Set FRONTEND_DIR in build.env to the path of your React app "
            f"(the folder that contains package.json + src/).\n"
            f"  → e.g. FRONTEND_DIR=/Users/you/…/field-crm/frontend"
        )
    if not (frontend_dir / "package.json").exists():
        raise SystemExit(
            f"{frontend_dir} does not look like a React app "
            f"(no package.json). Set FRONTEND_DIR correctly in build.env."
        )
    log.info(f"Frontend  : {frontend_dir}")

    # Strip stray trailing slashes on URL-ish env vars so they don't appear
    # in the JS bundle or logs.
    api_base = (os.environ.get("API_BASE_URL") or backend_url).rstrip("/")
    platform_host = (os.environ.get("PLATFORM_HOST") or "").strip().rstrip("/")
    web_base = (os.environ.get("WEB_BASE_URL") or "").strip().rstrip("/")

    web_env = {"REACT_APP_BACKEND_URL": api_base}
    if platform_host:
        web_env["REACT_APP_PLATFORM_HOST"] = platform_host
    if web_base:
        web_env["REACT_APP_WEB_BASE_URL"] = web_base
    capacitor.copy_web_bundle(frontend_dir, out_root / "webapp",
                              env_overrides=web_env, force_rebuild=True)

    # Save the tenant.json for reproducibility (redacted logo)
    dbg = json.loads(manifest_mod.to_debug_json(m))
    (out_root / "tenant.json").write_text(json.dumps(dbg, indent=2))

    # -------- 4. Emit capacitor.config.ts + package.json + install --------
    section("3/6 Writing capacitor.config.ts + package.json")
    server_host = platform_host or m.server_host
    server_url = f"https://{server_host}" if server_host else None
    capacitor.write_capacitor_config(
        out_root, m, bundle_id=bundle_id, app_name=app_name,
        server_url=server_url,
    )
    capacitor.write_package_json(out_root, m.slug)

    section("4/6 Installing Capacitor + adding platform")
    capacitor.install_and_bootstrap(out_root, args.platform)

    # Wipe any Firebase file that a previous build may have left behind.
    capacitor.wipe_stale_firebase_files(out_root)

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
        p = android_mod.AndroidBuildParams(
            project_root=out_root,
            bundle_id=bundle_id,
            app_name=app_name,
            version_name=args.version,
            version_code=args.version_code,
            output=args.output,
            release=args.release,
        )
        artifact = android_mod.apply_all(m, p, splash_source=splash_source)
    else:
        # iOS: default to "prep" unless user explicitly asked for archive/ipa.
        # We accept "apk"/"aab" via argparse but coerce them to "prep" for iOS
        # so the shared --output flag is forgiving on platform mismatch.
        ios_output = args.output if args.output in ("archive", "ipa", "prep") else "prep"
        p = ios_mod.IosBuildParams(
            project_root=out_root,
            bundle_id=bundle_id,
            app_name=app_name,
            version_name=args.version,
            version_code=args.version_code,
            output=ios_output,
        )
        artifact = ios_mod.apply_all(m, p, splash_source=splash_source)

    # -------- Done --------
    section("Build complete")
    print("")
    print("╔═══════════════════════════════════════════════════════════════════════╗")
    print(f"║  ✅  Tenant '{m.slug}' Capacitor project ready".ljust(72) + "║")
    print("╚═══════════════════════════════════════════════════════════════════════╝")
    print(f"  App name    : {app_name}")
    print(f"  Bundle ID   : {bundle_id}")
    print(f"  Version     : {args.version} ({args.version_code})")
    print(f"  API URL     : {web_env['REACT_APP_BACKEND_URL']}")
    if server_host:
        print(f"  Platform    : {server_host}")
    print(f"  Project dir : {out_root}")
    if args.platform == "android":
        print(f"  Android SDK : {os.environ.get('ANDROID_HOME', '(not set)')}")
        if artifact:
            print(f"  🎯 Artifact : {artifact}")
        else:
            if args.output == "apk":
                next_cmd = "assembleRelease" if args.release else "assembleDebug"
            else:
                next_cmd = "bundleRelease"
            print(f"  Next step   : cd {out_root}/android && ./gradlew {next_cmd}")
    else:
        if artifact:
            print(f"  🎯 Artifact : {artifact}")
        else:
            print(f"  Next steps  :")
            print(f"    A) CLI build (recommended): cd {out_root} && ./build-ios.sh")
            print(f"    B) Xcode UI:  open {out_root}/ios/App/App.xcworkspace  →  Product → Archive")
            print(f"    C) One-shot via build_app.py: rerun with --output ipa")
    print("")
    return 0


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main() -> int:
    args = _parse_args()
    configure_logging(args.verbose)

    # Load env file — do this BEFORE resolving anything else.
    env_path = args.env_file or _find_default_env_file()
    if env_path:
        load_env_file(env_path)
    else:
        log.info("No build.env found — using existing environment variables only")

    backend_url = _resolve_backend_url(args.backend_url)
    log.info(f"Backend URL: {backend_url}")

    if args.list_tenants:
        return cmd_list_tenants(backend_url, args)
    return cmd_build_tenant(backend_url, args)


if __name__ == "__main__":
    sys.exit(main())
