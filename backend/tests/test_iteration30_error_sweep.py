"""
Iteration 30 — Broad error sweep after the single-wallet + per-game ad gating overhaul.
Goal: verify no 5xx anywhere across the endpoints the app hits on Home/Earn/Wallet/Profile/
Withdraw/Task detail/Surveys/Quizzes/all 8 games. Also verify contract fields (game_ad_config,
min_withdrawal, reward_inr) still exist.
"""

import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://taskmint-dev.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")


def _fresh_session():
    """Session with no cookies leaking between tests."""
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    return s


@pytest.fixture(scope="module")
def device_user():
    """Anonymous device login — mirrors Continue button on welcome screen."""
    s = _fresh_session()
    device_id = f"TEST_dev_{uuid.uuid4().hex[:12]}"
    r = s.post(f"{BASE_URL}/api/auth/device", json={"device_id": device_id, "device_info": "iter30-sweep"})
    assert r.status_code == 200, f"device login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("session_token") or data.get("token")
    assert token, f"no token in device login response: {data}"
    return {"token": token, "device_id": device_id, "user_id": data.get("user", {}).get("user_id")}


@pytest.fixture
def auth_headers(device_user):
    return {"Authorization": f"Bearer {device_user['token']}", "Content-Type": "application/json"}


# ------------------------- Public / boot endpoints -------------------------
class TestPublicEndpoints:
    def test_app_config_has_game_ad_config(self):
        r = requests.get(f"{BASE_URL}/api/app-config", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "game_ad_config" in data, f"missing game_ad_config: {list(data.keys())}"
        gac = data["game_ad_config"]
        expected_keys = {"checkin", "higher_lower", "memory", "tictactoe", "math",
                         "daily_challenge", "tap", "trivia", "survey"}
        assert expected_keys.issubset(set(gac.keys())), f"missing keys: {expected_keys - set(gac.keys())}"
        for k, v in gac.items():
            assert "ad_type" in v and "chances_per_ad" in v and "every_n" in v, f"{k} malformed: {v}"

    def test_withdraw_settings_has_min_withdrawal(self):
        r = requests.get(f"{BASE_URL}/api/withdraw-settings", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "min_withdrawal" in data
        assert isinstance(data["min_withdrawal"], (int, float)) and data["min_withdrawal"] > 0

    def test_campaigns_reward_inr_field(self):
        r = requests.get(f"{BASE_URL}/api/campaigns", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # tolerate {"campaigns": [...]} or list
        campaigns = data.get("campaigns", data) if isinstance(data, dict) else data
        if campaigns:
            c = campaigns[0]
            assert "reward_inr" in c, f"campaign missing reward_inr: {list(c.keys())}"

    def test_no_5xx_on_public_boot_endpoints(self):
        for path in [
            "/api/app-config",
            "/api/withdraw-settings",
            "/api/campaigns",
            "/api/tasks/quizzes/random?limit=1",
        ]:
            r = requests.get(f"{BASE_URL}{path}", timeout=10)
            # Quizzes may require auth (401 ok) but never 5xx
            assert r.status_code < 500, f"{path} => {r.status_code} {r.text[:200]}"


# ------------------------- Auth flows -------------------------
class TestAuth:
    def test_device_login_ok(self):
        s = _fresh_session()
        r = s.post(f"{BASE_URL}/api/auth/device", json={"device_id": f"TEST_dev_{uuid.uuid4().hex[:8]}"})
        assert r.status_code == 200, r.text
        assert "session_token" in r.json() or "token" in r.json()

    def test_auth_me(self, device_user, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("user_id") == device_user["user_id"]


# ------------------------- Tabs: Home/Earn/Wallet/Profile -------------------------
class TestTabs:
    def test_wallet_transactions(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/wallet/transactions", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_earn_surveys_random(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/tasks/surveys/random?limit=1", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # tolerate list or dict
        items = data.get("surveys", data) if isinstance(data, dict) else data
        assert len(items) == 1, f"expected 1 survey, got {len(items)}"
        s0 = items[0]
        assert "questions" in s0 and len(s0["questions"]) > 0

    def test_earn_quizzes_random(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/tasks/quizzes/random?limit=5",
                         headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text


# ------------------------- Games — no 5xx on their status endpoints -------------------------
class TestGames:
    """Sweep each game's status endpoint (if it exists) to catch server crashes."""

    def test_no_game_endpoint_returns_5xx(self, auth_headers):
        # Best-effort: hit paths the games use. Missing => 404 (ok, means not defined); crash => 500 (fail)
        for path in [
            "/api/games/checkin",
            "/api/games/higher-lower/state",
            "/api/games/memory/state",
            "/api/games/tictactoe/state",
            "/api/games/math/state",
            "/api/games/daily-challenge/state",
            "/api/games/tap/state",
            "/api/games/trivia/state",
        ]:
            r = requests.get(f"{BASE_URL}{path}", headers=auth_headers, timeout=10)
            assert r.status_code < 500, f"{path} => {r.status_code} {r.text[:200]}"


# ------------------------- Withdraw single-wallet -------------------------
class TestWithdraw:
    def test_below_min_returns_400(self, auth_headers):
        payload = {"amount_points": 1, "method": "upi", "details": {"upi": "test@upi"}}
        r = requests.post(f"{BASE_URL}/api/withdraw", headers=auth_headers, json=payload, timeout=10)
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code}: {r.text}"

    def test_over_balance_returns_400(self, auth_headers):
        # New user has 0 pts — any amount above min should hit balance check
        payload = {"amount_points": 1000000, "method": "upi", "details": {"upi": "test@upi"}}
        r = requests.post(f"{BASE_URL}/api/withdraw", headers=auth_headers, json=payload, timeout=10)
        assert r.status_code in (400, 422), r.text


# ------------------------- Admin -------------------------
@pytest.fixture(scope="module")
def admin_token():
    s = _fresh_session()
    # Bootstrap device then admin login
    dev = s.post(f"{BASE_URL}/api/auth/device", json={"device_id": f"TEST_admin_dev_{uuid.uuid4().hex[:8]}"})
    assert dev.status_code == 200, dev.text
    token = dev.json().get("session_token") or dev.json().get("token")

    r = s.post(
        f"{BASE_URL}/api/auth/admin-login",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"email": os.environ.get("ADMIN_EMAIL", "93altaff@gmail.com"),
              "password": os.environ.get("ADMIN_PASSWORD", "9372@Altaf93")},
    )
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    admin_tok = r.json().get("session_token") or r.json().get("token") or token
    return admin_tok


class TestAdminGameAds:
    def test_admin_app_config_get(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/app-config",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200, r.text
        assert "game_ad_config" in r.json()

    def test_admin_app_config_put_roundtrip(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        cur = requests.get(f"{BASE_URL}/api/admin/app-config", headers=headers).json()
        gac = dict(cur["game_ad_config"])
        original = dict(gac["memory"])
        try:
            gac["memory"] = {**original, "every_n": 9}
            r = requests.put(f"{BASE_URL}/api/admin/app-config",
                             headers=headers, json={**cur, "game_ad_config": gac})
            assert r.status_code == 200, r.text
            reread = requests.get(f"{BASE_URL}/api/app-config").json()
            assert reread["game_ad_config"]["memory"]["every_n"] == 9
        finally:
            gac["memory"] = original
            requests.put(f"{BASE_URL}/api/admin/app-config",
                         headers=headers, json={**cur, "game_ad_config": gac})
