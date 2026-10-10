"""Shared pytest setup — makes the suite runnable outside the Emergent pod.

Older test files hardcode pod paths (`sys.path.insert(0, "/app/backend")`,
`open("/app/frontend/.env")`). On a local checkout the repo may live anywhere,
so we put the real backend/ and repo root on sys.path first and default
REACT_APP_BACKEND_URL from frontend/.env when the env var is unset. Inside the
pod (where /app is the repo) all of this is a no-op.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]   # <repo>/backend
_REPO = _BACKEND.parent                           # <repo>

for p in (str(_BACKEND), str(_REPO)):
    if p not in sys.path:
        sys.path.insert(0, p)

if not os.environ.get("REACT_APP_BACKEND_URL"):
    env_file = _REPO / "frontend" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip().strip('"')
                break
