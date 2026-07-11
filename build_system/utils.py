"""Shared helpers for the FieldCRM build system."""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Optional

log = logging.getLogger("build_app")


# ---------- Env file (dotenv-style) ----------
_ENV_LINE_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")


def load_env_file(path: Path, override_existing: bool = False) -> dict[str, str]:
    """Parse a .env file and inject into os.environ.

    Returns the dict of loaded values. Blank lines and lines starting with `#`
    are ignored. Values may be optionally wrapped in single/double quotes.
    Existing env vars are NOT overwritten unless override_existing=True.
    """
    if not path.exists():
        return {}
    loaded: dict[str, str] = {}
    for line_no, raw in enumerate(path.read_text().splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = _ENV_LINE_RE.match(line)
        if not m:
            log.warning(f"{path}:{line_no}  cannot parse: {raw!r}")
            continue
        key, val = m.group(1), m.group(2)
        # Strip an inline `#` comment (only if outside quotes).
        if val and val[0] not in ("'", '"'):
            hash_idx = val.find(" #")
            if hash_idx >= 0:
                val = val[:hash_idx].rstrip()
        # Strip surrounding quotes.
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        loaded[key] = val
        if override_existing or key not in os.environ:
            os.environ[key] = val
    log.info(f"Loaded {len(loaded)} vars from {path}")
    return loaded


# ---------- Logging ----------
def configure_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )


def section(title: str) -> None:
    bar = "─" * max(4, 78 - len(title) - 2)
    log.info("")
    log.info(f"▶ {title} {bar}")


# ---------- Text / naming ----------
def slugify_id(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def default_bundle_id(slug: str, prefix: str = "in.localappstore.fieldcrm") -> str:
    return f"{prefix}.{slugify_id(slug)}"


def sanitize_app_name(name: str) -> str:
    """Escape XML-hostile characters for strings.xml."""
    return (name.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;")
                .replace("'", "&apos;"))


# ---------- Colors ----------
def parse_color(value: Optional[str], default: str = "#2C5E43") -> str:
    if not value:
        return default
    v = value.strip()
    if not v.startswith("#"):
        v = "#" + v
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", v):
        return default
    return v.upper()


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# ---------- Filesystem ----------
def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p


def rmtree_if_exists(p: Path) -> None:
    if p.exists():
        shutil.rmtree(p)


def write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    path.write_text(content, encoding="utf-8")


def write_bytes(path: Path, content: bytes) -> None:
    ensure_dir(path.parent)
    path.write_bytes(content)


# ---------- Subprocess ----------
def run(cmd: Iterable[str], cwd: Optional[Path] = None,
        env: Optional[dict] = None, check: bool = True,
        capture: bool = False) -> subprocess.CompletedProcess:
    cmd_list = [str(c) for c in cmd]
    log.info(f"$ {' '.join(cmd_list)}  (cwd={cwd or os.getcwd()})")
    merged_env = os.environ.copy()
    if env:
        merged_env.update({k: str(v) for k, v in env.items()})
    result = subprocess.run(
        cmd_list, cwd=str(cwd) if cwd else None, env=merged_env,
        check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
    )
    if check and result.returncode != 0:
        if capture:
            sys.stderr.write(result.stdout or "")
            sys.stderr.write(result.stderr or "")
        raise SystemExit(f"Command failed ({result.returncode}): {' '.join(cmd_list)}")
    return result


def has_command(cmd: str) -> bool:
    return shutil.which(cmd) is not None


# ---------- Errors ----------
class BuildError(RuntimeError):
    pass
