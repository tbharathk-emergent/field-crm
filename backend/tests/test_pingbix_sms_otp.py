"""Unit tests for the Pingbix SMS/OTP integration (sms_service.py).

Pure unit tests — no running server or MongoDB required:
    python -m pytest backend/tests/test_pingbix_sms_otp.py -v

Covers:
  1. OTP generation (length, charset, randomness).
  2. OTP hashing — HMAC round trip, wrong-OTP rejection, phone binding.
  3. Provider resolution — mock default, pingbix only when fully configured,
     graceful fallback to mock when half-configured (never locks out login).
  4. Runtime overrides from Platform Settings (Super Admin → Settings) win
     over env vars; clearing falls back to env.
  5. Message templating ({otp}/{app} substitution).
  6. send_otp_sms never raises, even when the gateway is unreachable.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Make backend/ importable regardless of where pytest is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import sms_service


@pytest.fixture(autouse=True)
def _clean_runtime(monkeypatch):
    """Isolate every test from env + runtime override leakage."""
    sms_service._RUNTIME.clear()
    for k in ("SMS_PROVIDER", "PINGBIX_BASE_URL", "PINGBIX_API_KEY",
              "PINGBIX_SENDER_ID", "PINGBIX_ENTITY_ID", "PINGBIX_TEMPLATE_ID",
              "PINGBIX_OTP_TEMPLATE"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret")
    yield
    sms_service._RUNTIME.clear()


# ---------- 1. OTP generation ----------

def test_generate_otp_is_6_digits():
    for _ in range(50):
        otp = sms_service.generate_otp()
        assert len(otp) == sms_service.OTP_LENGTH == 6
        assert otp.isdigit()


def test_generate_otp_varies():
    assert len({sms_service.generate_otp() for _ in range(30)}) > 1


# ---------- 2. OTP hashing ----------

def test_hash_round_trip():
    h = sms_service.hash_otp("9000000001", "123456")
    assert sms_service.verify_otp_hash("9000000001", "123456", h)


def test_wrong_otp_rejected():
    h = sms_service.hash_otp("9000000001", "123456")
    assert not sms_service.verify_otp_hash("9000000001", "654321", h)


def test_hash_is_phone_bound():
    h = sms_service.hash_otp("9000000001", "123456")
    assert not sms_service.verify_otp_hash("9000000002", "123456", h)


def test_empty_stored_hash_rejected():
    assert not sms_service.verify_otp_hash("9000000001", "123456", "")


# ---------- 3. Provider resolution ----------

def test_default_provider_is_mock():
    assert sms_service.active_provider() == "mock"
    assert not sms_service.pingbix_configured()


def test_pingbix_active_when_fully_configured(monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "pingbix")
    monkeypatch.setenv("PINGBIX_BASE_URL", "https://example.test/send")
    monkeypatch.setenv("PINGBIX_API_KEY", "k")
    monkeypatch.setenv("PINGBIX_SENDER_ID", "FLDCRM")
    assert sms_service.active_provider() == "pingbix"


def test_half_configured_pingbix_falls_back_to_mock(monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "pingbix")
    monkeypatch.setenv("PINGBIX_API_KEY", "k")  # no BASE_URL / SENDER_ID
    assert sms_service.active_provider() == "mock"


# ---------- 4. Runtime overrides (Platform Settings) ----------

def test_runtime_settings_override_env(monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "mock")
    monkeypatch.setenv("PINGBIX_BASE_URL", "https://example.test/send")
    sms_service.apply_runtime_sms_settings(
        {"sms_provider": "pingbix", "sms_api_key": "db-key", "sms_sender_id": "DBSNDR"})
    assert sms_service.active_provider() == "pingbix"
    assert sms_service.status()["sender_id"] == "DBSNDR"


def test_clearing_runtime_falls_back_to_env(monkeypatch):
    sms_service.apply_runtime_sms_settings({"sms_provider": "pingbix", "sms_api_key": "x"})
    sms_service.apply_runtime_sms_settings({"sms_provider": "", "sms_api_key": ""})
    assert sms_service.active_provider() == "mock"


# ---------- 5. Message templating ----------

def test_otp_message_substitution(monkeypatch):
    monkeypatch.setenv("PINGBIX_OTP_TEMPLATE", "OTP {otp} for {app}.")
    monkeypatch.setenv("APP_NAME", "fieldcrm")
    assert sms_service._otp_message("111222") == "OTP 111222 for fieldcrm."


def test_default_template_contains_otp():
    assert "999888" in sms_service._otp_message("999888")


# ---------- 6. send_otp_sms never raises ----------

def test_send_in_mock_mode_is_noop_ok():
    r = sms_service.send_otp_sms("9000000001", "123456")
    assert r == {"ok": True, "provider": "mock"}


def test_send_with_unreachable_gateway_returns_error(monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "pingbix")
    monkeypatch.setenv("PINGBIX_BASE_URL", "http://127.0.0.1:9")  # closed port
    monkeypatch.setenv("PINGBIX_API_KEY", "k")
    monkeypatch.setenv("PINGBIX_SENDER_ID", "FLDCRM")
    monkeypatch.setenv("PINGBIX_TIMEOUT_SECONDS", "1")
    r = sms_service.send_otp_sms("9000000001", "123456")
    assert r["ok"] is False and r["provider"] == "pingbix" and r.get("error")
