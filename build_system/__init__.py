"""FieldCRM tenant-aware Capacitor build system.

Entry point: /app/build_app.py

Modules:
    manifest  – fetches build manifest from backend as super admin
    assets    – generates icons + splash from tenant logo (Pillow)
    capacitor – emits capacitor.config.ts + copies webapp bundle
    android   – Android-specific mutations (Firebase, signing, gradle build)
    ios       – iOS-specific mutations (Firebase, Info.plist, Xcode project)
    utils     – shared helpers
"""

from . import assets, android, capacitor, ios, manifest, utils  # noqa: F401
