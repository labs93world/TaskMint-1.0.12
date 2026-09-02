"""
Iteration 31 — Force-update gate wiring in _layout.tsx.

Covers backend endpoints that feed the gate:
  - GET  /api/version                    (public)
  - GET  /api/admin/version              (admin-only, auth via admin device session)
  - PUT  /api/admin/version              (admin PUT round-trip)

Session model (from review request): admin-login upgrades the SAME device
session_token to admin (returns no new token). So we:
  1) POST /api/auth/device -> get session_token
  2) POST /api/auth/admin-login with Bearer <session_token> -> upgrades that same token
  3) Use same Bearer <session_token> for /admin/version endpoints
"""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values

_FE_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or _FE_ENV.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")

ADMIN_EMAIL = "93altaff@gmail.com"
ADMIN_PASSWORD = "9372@Altaf93"


# ---------------- helpers ----------------

def _device_login():
    """Create a fresh anonymous device session and return its session_token."""
    device_id = f"TEST_dev_{uuid.uuid4().hex[:12]}"
    r = requests.post(
        f"{BASE_URL}/api/auth/device",
        json={"device_id": device_id, "platform": "web"},
        timeout=15,
    )
    assert r.status_code == 200, f"/api/auth/device failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token")
    assert tok, f"no session_token in device login response: {r.json()}"
    return tok


def _admin_upgrade(token: str):
    """Upgrade an existing device session to admin. Returns nothing new; token stays the same."""
    r = requests.post(
        f"{BASE_URL}/api/auth/admin-login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    assert r.status_code == 200, f"admin-login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True or body.get("user", {}).get("is_admin") is True, body


@pytest.fixture(scope="module")
def admin_token():
    tok = _device_login()
    _admin_upgrade(tok)
    return tok


# ---------------- public /api/version ----------------

class TestPublicVersion:
    """Public version endpoint used by UpdateGateHost on cold start."""

    def test_get_version_public(self):
        r = requests.get(f"{BASE_URL}/api/version", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # required fields the gate reads
        for k in ("latest_version", "play_store_url", "force_update"):
            assert k in data, f"missing key {k} in {data}"
        assert isinstance(data["force_update"], bool)


# ---------------- admin /api/admin/version round-trip ----------------

class TestAdminVersionRoundTrip:
    """PUT then GET verifies persistence. Always resets at the end."""

    ORIG = {
        "latest_version": "1.0.1",
        "min_supported_version": "1.0.0",
        "play_store_url": "https://play.google.com/store/apps/details?id=com.labs93world.taskmint",
        "force_update": False,
        "release_notes": "",
    }

    def test_admin_get_requires_admin(self):
        # anonymous device (non-admin) should get 401/403
        tok = _device_login()
        r = requests.get(
            f"{BASE_URL}/api/admin/version",
            headers={"Authorization": f"Bearer {tok}"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"non-admin should be blocked, got {r.status_code} {r.text}"

    def test_admin_get_version(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/version",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "latest_version" in data and "force_update" in data

    def test_put_force_update_on(self, admin_token):
        payload = {
            "latest_version": "1.0.2",
            "min_supported_version": "1.0.0",
            "play_store_url": "https://play.google.com/store/apps/details?id=com.labs93world.taskmint",
            "force_update": True,
            "release_notes": "TEST_iter31 forced",
        }
        r = requests.put(
            f"{BASE_URL}/api/admin/version",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # GET verifies persistence
        g = requests.get(f"{BASE_URL}/api/version", timeout=15).json()
        assert g["latest_version"] == "1.0.2"
        assert g["force_update"] is True
        assert g["release_notes"] == "TEST_iter31 forced"

    def test_put_force_update_off_outdated(self, admin_token):
        payload = {
            "latest_version": "1.0.2",
            "min_supported_version": "1.0.0",
            "play_store_url": "https://play.google.com/store/apps/details?id=com.labs93world.taskmint",
            "force_update": False,
            "release_notes": "TEST_iter31 dismissible",
        }
        r = requests.put(
            f"{BASE_URL}/api/admin/version",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/version", timeout=15).json()
        assert g["latest_version"] == "1.0.2"
        assert g["force_update"] is False

    def test_zzz_reset_to_defaults(self, admin_token):
        """Named zzz so it runs last within the class. Resets state as review request requires."""
        r = requests.put(
            f"{BASE_URL}/api/admin/version",
            json=self.ORIG,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/version", timeout=15).json()
        assert g["latest_version"] == "1.0.1"
        assert g["force_update"] is False
        assert g["release_notes"] == ""
