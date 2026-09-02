"""
Iteration 34: Exchange ratio fix in admin screens + Referral history schema.

Verifies:
  1) Admin can set exchange_points_per_inr to 1000 via /admin/app-config
  2) GET /admin/app-config and /withdraw-settings reflect exchange_points_per_inr=1000
  3) GET /admin/campaigns returns raw reward_points (client computes ₹)
  4) GET /campaigns returns reward_inr computed from live ratio
  5) GET /referrals/history returns entries with joined_at and earned_points fields
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "93altaff@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "9372@Altaf93")


# --------- Fixtures ---------
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    # 1) Device login (anonymous user)
    device_id = "TEST_device_iter34_admin"
    r = api_client.post(
        f"{BASE_URL}/api/auth/device",
        json={"device_id": device_id, "device_hash": device_id, "name": "TESTADMIN"},
        timeout=15,
    )
    assert r.status_code == 200, f"device login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token")
    assert tok
    # 2) Upgrade to admin
    r2 = api_client.post(
        f"{BASE_URL}/api/auth/admin-login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=15,
    )
    assert r2.status_code == 200, f"admin-login failed: {r2.status_code} {r2.text}"
    return tok


@pytest.fixture(scope="module")
def user_token(api_client):
    # Regular user session for /referrals/history
    device_id = "TEST_device_iter34_user"
    r = api_client.post(
        f"{BASE_URL}/api/auth/device",
        json={"device_id": device_id, "device_hash": device_id, "name": "TESTUSER"},
        timeout=15,
    )
    assert r.status_code == 200, f"device login failed: {r.status_code} {r.text}"
    return r.json().get("session_token")


# --------- Tests ---------
class TestExchangeRatioBackend:
    def test_get_current_app_config(self, api_client, admin_token):
        r = api_client.get(
            f"{BASE_URL}/api/admin/app-config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert "exchange_points_per_inr" in cfg
        assert isinstance(cfg["exchange_points_per_inr"], int)

    def test_set_ratio_to_1000_and_verify(self, api_client, admin_token):
        # Get current cfg first to preserve non-ratio fields
        r = api_client.get(
            f"{BASE_URL}/api/admin/app-config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        cfg = r.json()
        cfg["exchange_points_per_inr"] = 1000

        r2 = api_client.put(
            f"{BASE_URL}/api/admin/app-config",
            json=cfg,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("exchange_points_per_inr") == 1000

        # Verify persisted through fresh GET
        r3 = api_client.get(
            f"{BASE_URL}/api/admin/app-config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r3.json().get("exchange_points_per_inr") == 1000

    def test_withdraw_settings_reflects_ratio(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/withdraw-settings", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("exchange_points_per_inr") == 1000
        assert isinstance(data.get("amounts", []), list)

    def test_admin_campaigns_returns_raw_points(self, api_client, admin_token):
        r = api_client.get(
            f"{BASE_URL}/api/admin/campaigns",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        for c in arr:
            assert "reward_points" in c
            # Client computes ₹ from reward_points / ratio; reward_inr may or may not be present.

    def test_public_campaigns_reward_inr_live_ratio(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/campaigns", timeout=10)
        assert r.status_code == 200
        arr = r.json()
        for c in arr:
            pts = int(c.get("reward_points", 0) or 0)
            inr = float(c.get("reward_inr", 0) or 0)
            # With ratio 1000, expect inr == pts/1000 (rounded to 2 dp)
            expected = round(pts / 1000.0, 2)
            assert abs(inr - expected) < 0.01, (
                f"campaign {c.get('id')} reward_inr={inr} expected≈{expected} pts={pts}"
            )


class TestReferralHistory:
    def test_history_schema(self, api_client, user_token):
        r = api_client.get(
            f"{BASE_URL}/api/referrals/history",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        for row in arr:
            # These keys must exist in every referral history row
            assert "user_id" in row
            assert "name" in row
            assert "joined_at" in row
            assert "earned_points" in row
            # earned_points must be numeric (int/None handled as 0 by client)
            if row["earned_points"] is not None:
                assert isinstance(row["earned_points"], int)

    def test_history_returns_200(self, api_client, user_token):
        r = api_client.get(
            f"{BASE_URL}/api/referrals/history",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
