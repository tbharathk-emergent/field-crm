"""Regression tests for the Feb 2026 iOS Push + Splash fixes.

Covers:
  1. Info.plist patch sets FirebaseAppDelegateProxyEnabled=NO (required for
     Capacitor + Firebase Messaging coexistence on iOS — without this, the
     permission dialog never completes its round-trip because Firebase's
     swizzling steals the APNs delegate methods from Capacitor's plugin).
  2. AppDelegate.swift now includes a
     `didFailToRegisterForRemoteNotificationsWithError` handler with NSLog so
     that on-device APNs failures are visible in Console.app.
  3. install_splash_ios() populates Assets.xcassets/Splash.imageset with the
     tenant logo at @1x/@2x/@3x + a valid Contents.json — the missing piece
     that caused "tenant logo missing from splash screen" on iOS builds.
"""
from __future__ import annotations

import json
import plistlib
import shutil
import sys
from pathlib import Path

import pytest
from PIL import Image

# Make /app importable so we can `from build_system import ios` under pytest.
sys.path.insert(0, "/app")

from build_system import ios as ios_mod  # noqa: E402


def _make_dummy_project(tmp_path: Path) -> Path:
    """Materialize a minimal iOS Capacitor project layout for patching."""
    root = tmp_path / "proj"
    ios_app = root / "ios" / "App" / "App"
    ios_app.mkdir(parents=True)
    (ios_app / "Assets.xcassets").mkdir()

    # Minimal Info.plist
    plist_path = ios_app / "Info.plist"
    with plist_path.open("wb") as f:
        plistlib.dump(
            {"CFBundleName": "Old", "CFBundleShortVersionString": "0.0.0"},
            f,
        )

    # Minimal AppDelegate.swift (as Capacitor scaffolds it)
    (ios_app / "AppDelegate.swift").write_text(
        "import UIKit\n"
        "import Capacitor\n"
        "\n"
        "@UIApplicationMain\n"
        "class AppDelegate: UIResponder, UIApplicationDelegate {\n"
        "    var window: UIWindow?\n"
        "    func application(_ application: UIApplication, "
        "didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {\n"
        "        return true\n"
        "    }\n"
        "}\n"
    )
    return root


def test_info_plist_disables_firebase_appdelegate_proxy(tmp_path):
    """FirebaseAppDelegateProxyEnabled must be False so Capacitor owns APNs."""
    root = _make_dummy_project(tmp_path)
    p = ios_mod.IosBuildParams(
        project_root=root,
        bundle_id="in.localappstore.fieldcrm.demo",
        app_name="Demo",
        version_name="1.2.3",
        version_code=42,
    )
    ios_mod.patch_info_plist(p)

    with (root / "ios" / "App" / "App" / "Info.plist").open("rb") as f:
        data = plistlib.load(f)

    assert data["FirebaseAppDelegateProxyEnabled"] is False, (
        "FirebaseAppDelegateProxyEnabled must be False — without it, Firebase "
        "swizzling intercepts APNs delegate methods and Capacitor's Push "
        "permission dialog never completes."
    )
    assert data["CFBundleDisplayName"] == "Demo"
    assert data["CFBundleShortVersionString"] == "1.2.3"
    assert data["CFBundleVersion"] == "42"
    assert "remote-notification" in data["UIBackgroundModes"]


def test_appdelegate_has_fail_handler(tmp_path):
    """didFailToRegisterForRemoteNotificationsWithError must be present."""
    root = _make_dummy_project(tmp_path)
    ok = ios_mod.patch_app_delegate(root)
    assert ok is True

    content = (root / "ios" / "App" / "App" / "AppDelegate.swift").read_text()
    assert "import Firebase" in content
    assert "FirebaseApp.configure()" in content
    assert "Messaging.messaging().apnsToken = deviceToken" in content
    assert "didFailToRegisterForRemoteNotificationsWithError" in content, (
        "AppDelegate must implement didFailToRegisterForRemoteNotifications... "
        "so provisioning/entitlement failures are observable via NSLog."
    )
    assert "NSLog" in content, (
        "NSLog is required so on-device APNs errors surface in Console.app."
    )


def test_appdelegate_patch_idempotent(tmp_path):
    """Re-running the patcher must not double-inject the handler."""
    root = _make_dummy_project(tmp_path)
    ios_mod.patch_app_delegate(root)
    ios_mod.patch_app_delegate(root)  # second call should be a no-op
    content = (root / "ios" / "App" / "App" / "AppDelegate.swift").read_text()
    # Exactly one Firebase import + one apnsToken bridge (marker de-dupes).
    assert content.count("import Firebase") == 1
    assert content.count("Messaging.messaging().apnsToken") == 1


def test_install_splash_ios_creates_imageset(tmp_path):
    """Splash.imageset must contain 3 PNGs + valid Contents.json."""
    root = _make_dummy_project(tmp_path)
    # Create a fake splash source PNG.
    splash_src = tmp_path / "splash.png"
    Image.new("RGB", (2732, 2732), (44, 94, 67)).save(splash_src)

    ok = ios_mod.install_splash_ios(root, splash_src)
    assert ok is True

    splash_set = (root / "ios" / "App" / "App" / "Assets.xcassets" /
                  "Splash.imageset")
    assert splash_set.is_dir()
    assert (splash_set / "splash.png").exists()
    assert (splash_set / "splash@2x.png").exists()
    assert (splash_set / "splash@3x.png").exists()

    contents = json.loads((splash_set / "Contents.json").read_text())
    assert len(contents["images"]) == 3
    scales = sorted(img["scale"] for img in contents["images"])
    assert scales == ["1x", "2x", "3x"]
    for img in contents["images"]:
        assert img["idiom"] == "universal"
        # File referenced must actually exist on disk.
        assert (splash_set / img["filename"]).exists()


def test_install_splash_ios_missing_source_returns_false(tmp_path):
    """Guard: missing source PNG is a soft-fail, not an exception."""
    root = _make_dummy_project(tmp_path)
    assert ios_mod.install_splash_ios(root, tmp_path / "nope.png") is False


def test_install_splash_ios_missing_project_returns_false(tmp_path):
    """Guard: missing Assets.xcassets folder short-circuits."""
    root = tmp_path / "empty"
    root.mkdir()
    splash_src = tmp_path / "s.png"
    Image.new("RGB", (10, 10), (0, 0, 0)).save(splash_src)
    assert ios_mod.install_splash_ios(root, splash_src) is False
