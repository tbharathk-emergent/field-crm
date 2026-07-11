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

sys.path.insert(0, "/app")

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
    for cand in (Path("./build.env").resolve(),
                 Path("/app/build.env")):
        if cand.exists():
            return cand
    return None


def _resolve_backend_url(cli_url: str | None) -> str:
    """Priority: --backend-url > API_BASE_URL > BACKEND_URL > REACT_APP_BACKEND_URL."""
    if cli_url:
        return cli_url.rstrip("/")
    for key in ("API_BASE_URL", "BACKEND_URL", "REACT_APP_BACKEND_URL"):
        v = os.environ.get(key)
        if v:
            return v.rstrip("/")
    # Last resort — read from /app/frontend/.env
    env_file = Path("/app/frontend/.env")
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
    ap.add_argument("--output", choices=["apk", "aab", "prep"], default="apk",
                    help="Android only. apk (debug, sideload) | aab (release) | prep (no compile)")

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
    frontend_dir = Path(os.environ.get("FRONTEND_DIR", "/app/frontend"))
    web_env = {
        "REACT_APP_BACKEND_URL": os.environ.get("API_BASE_URL", backend_url),
    }
    if os.environ.get("PLATFORM_HOST"):
        web_env["REACT_APP_PLATFORM_HOST"] = os.environ["PLATFORM_HOST"]
    if os.environ.get("WEB_BASE_URL"):
        web_env["REACT_APP_WEB_BASE_URL"] = os.environ["WEB_BASE_URL"]
    capacitor.copy_web_bundle(frontend_dir, out_root / "webapp",
                              env_overrides=web_env, force_rebuild=True)

    # Save the tenant.json for reproducibility (redacted logo)
    dbg = json.loads(manifest_mod.to_debug_json(m))
    (out_root / "tenant.json").write_text(json.dumps(dbg, indent=2))

    # -------- 4. Emit capacitor.config.ts + package.json + install --------
    section("3/6 Writing capacitor.config.ts + package.json")
    server_host = os.environ.get("PLATFORM_HOST") or m.server_host
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
    print(f"  API URL     : {web_env['REACT_APP_BACKEND_URL']}")
    if server_host:
        print(f"  Platform    : {server_host}")
    print(f"  Project dir : {out_root}")
    if args.platform == "android":
        print(f"  Android SDK : {os.environ.get('ANDROID_HOME', '(not set)')}")
        if artifact:
            print(f"  🎯 Artifact : {artifact}")
        else:
            next_cmd = "assembleDebug" if args.output == "apk" else "bundleRelease"
            print(f"  Next step   : cd {out_root}/android && ./gradlew {next_cmd}")
    else:
        print(f"  Next step   : Open {out_root}/ios/App/App.xcworkspace on your Mac in Xcode")
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
