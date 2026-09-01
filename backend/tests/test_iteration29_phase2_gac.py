"""Iteration 29 — Phase 2 per-game ad-gating (game_ad_config).

Covers:
- GET /api/app-config returns game_ad_config with all 9 keys and correct schema.
- Admin GET /api/admin/app-config exposes game_ad_config.
- Admin PUT /api/admin/app-config round-trips changes to memory.every_n and
  higher_lower.every_n (persist verified by re-GET). Values reset after.
- Regression: single-wallet withdraw still works (no `source`),
  /api/campaigns reward_inr respects live exchange ratio, and
  /api/tasks/surveys/random?limit=1 still returns exactly 1 survey.
"""
import os
import uuid
import copy
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_FE = dotenv_values("/app/frontend/.env")
_BE = dotenv_values("/app/backend/.env")

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or _FE.get("EXPO_PUBLIC_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _BE.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _BE.get("DB_NAME") or "test_database"
ADMIN_EMAIL = _BE.get("ADMIN_EMAIL", "93altaff@gmail.com")
ADMIN_PASSWORD = _BE.get("ADMIN_PASSWORD", "9372@Altaf93")

TIMEOUT = 30

REQUIRED_GAME_KEYS = [
    "checkin", "higher_lower", "memory", "tictactoe", "math",
    "daily_challenge", "tap", "trivia", "survey",
]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class _NoCookie:
    """Session-less requests to avoid token leakage across tests."""
    def _do(self, method, url, **kw):
        kw.setdefault("timeout", TIMEOUT)
        return requests.request(method, url, **kw)
    def get(self, u, **kw): return self._do("GET", u, **kw)
    def post(self, u, **kw): return self._do("POST", u, **kw)
    def put(self, u, **kw): return self._do("PUT", u, **kw)
    def delete(self, u, **kw): return self._do("DELETE", u, **kw)


def _device_login(http):
    did = f"TEST_dev_{uuid.uuid4().hex[:12]}"
    r = http.post(
        f"{BASE_URL}/api/auth/device",
        json={"device_id": did, "fingerprint": f"fp_{did}"},
    )
    assert r.status_code == 200, r.text
    b = r.json()
    return b["session_token"], b["user"]["user_id"]


@pytest.fixture(scope="session")
def http():
    return _NoCookie()


@pytest.fixture(scope="session")
def mongo_db():
    if not MONGO_URL:
        pytest.skip("no MONGO_URL")
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="session")
def admin_tok(http):
    tok, _ = _device_login(http)
    r = http.post(
        f"{BASE_URL}/api/auth/admin-login",
        headers=_hdr(tok),
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return tok


# ---------- Public GET /api/app-config ----------
class TestPublicAppConfigGameAds:
    def test_returns_game_ad_config_with_all_keys(self, http):
        r = http.get(f"{BASE_URL}/api/app-config")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "game_ad_config" in body, list(body.keys())
        gac = body["game_ad_config"]
        for k in REQUIRED_GAME_KEYS:
            assert k in gac, f"missing key {k}: got {list(gac.keys())}"
            entry = gac[k]
            assert "ad_type" in entry and entry["ad_type"] in ("interstitial", "rewarded")
            assert "chances_per_ad" in entry and isinstance(entry["chances_per_ad"], int)
            assert "every_n" in entry and isinstance(entry["every_n"], int)

    def test_default_shape_matches_spec(self, http):
        """Sanity: memory=rewarded, daily_challenge=rewarded, checkin/survey=interstitial."""
        gac = http.get(f"{BASE_URL}/api/app-config").json()["game_ad_config"]
        assert gac["memory"]["ad_type"] == "rewarded"
        assert gac["daily_challenge"]["ad_type"] == "rewarded"
        assert gac["checkin"]["ad_type"] == "interstitial"
        assert gac["survey"]["ad_type"] == "interstitial"


# ---------- Admin GET /api/admin/app-config ----------
class TestAdminAppConfigGameAds:
    def test_admin_get_exposes_game_ad_config(self, http, admin_tok):
        r = http.get(f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "game_ad_config" in body
        gac = body["game_ad_config"]
        for k in REQUIRED_GAME_KEYS:
            assert k in gac

    def test_admin_get_requires_admin(self, http):
        """Anonymous device token must NOT be able to read admin config."""
        tok, _ = _device_login(http)
        r = http.get(f"{BASE_URL}/api/admin/app-config", headers=_hdr(tok))
        assert r.status_code in (401, 403), r.text


# ---------- Admin PUT round-trip ----------
class TestAdminAppConfigRoundtrip:
    def test_put_updates_memory_and_higher_lower_every_n(self, http, admin_tok):
        # 1. GET original config
        original = http.get(
            f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_tok)
        ).json()
        orig_mem_every = original["game_ad_config"]["memory"]["every_n"]
        orig_hl_every = original["game_ad_config"]["higher_lower"]["every_n"]

        # 2. Mutate — pick values distinct from originals
        new_mem_every = 3 if orig_mem_every != 3 else 4
        new_hl_every = 5 if orig_hl_every != 5 else 6

        payload = copy.deepcopy(original)
        payload["game_ad_config"]["memory"]["every_n"] = new_mem_every
        payload["game_ad_config"]["higher_lower"]["every_n"] = new_hl_every

        try:
            r = http.put(
                f"{BASE_URL}/api/admin/app-config",
                headers=_hdr(admin_tok), json=payload,
            )
            assert r.status_code == 200, r.text
            put_body = r.json()
            assert put_body["game_ad_config"]["memory"]["every_n"] == new_mem_every
            assert put_body["game_ad_config"]["higher_lower"]["every_n"] == new_hl_every

            # 3. Re-GET admin and public — both must reflect persisted values
            after_admin = http.get(
                f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_tok)
            ).json()
            assert after_admin["game_ad_config"]["memory"]["every_n"] == new_mem_every
            assert after_admin["game_ad_config"]["higher_lower"]["every_n"] == new_hl_every

            after_public = http.get(f"{BASE_URL}/api/app-config").json()
            assert after_public["game_ad_config"]["memory"]["every_n"] == new_mem_every
            assert after_public["game_ad_config"]["higher_lower"]["every_n"] == new_hl_every

            # ad_type of other games untouched
            assert after_admin["game_ad_config"]["daily_challenge"]["ad_type"] == "rewarded"
        finally:
            # 4. Reset to original
            http.put(
                f"{BASE_URL}/api/admin/app-config",
                headers=_hdr(admin_tok), json=original,
            )
            reset = http.get(
                f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_tok)
            ).json()
            assert reset["game_ad_config"]["memory"]["every_n"] == orig_mem_every
            assert reset["game_ad_config"]["higher_lower"]["every_n"] == orig_hl_every

    def test_put_can_swap_ad_type(self, http, admin_tok):
        """Verify ad_type is admin-editable (change tap interstitial→rewarded then back)."""
        original = http.get(
            f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_tok)
        ).json()
        orig_type = original["game_ad_config"]["tap"]["ad_type"]
        target = "rewarded" if orig_type == "interstitial" else "interstitial"

        payload = copy.deepcopy(original)
        payload["game_ad_config"]["tap"]["ad_type"] = target

        try:
            r = http.put(
                f"{BASE_URL}/api/admin/app-config",
                headers=_hdr(admin_tok), json=payload,
            )
            assert r.status_code == 200, r.text
            after = http.get(f"{BASE_URL}/api/app-config").json()
            assert after["game_ad_config"]["tap"]["ad_type"] == target
        finally:
            http.put(
                f"{BASE_URL}/api/admin/app-config",
                headers=_hdr(admin_tok), json=original,
            )


# ---------- Regression: single-wallet withdraw ----------
class TestRegressionWithdraw:
    def test_withdraw_no_source_field(self, http, mongo_db):
        tok, uid = _device_login(http)
        mongo_db.users.update_one(
            {"user_id": uid},
            {"$set": {
                "points": 30000,
                "games_task_points": 30000,
                "mobile_number": "+919000000123",
                "withdrawals_today": 0,
                "withdrawals_today_date": None,
            }},
        )
        r = http.post(
            f"{BASE_URL}/api/withdraw",
            headers=_hdr(tok),
            json={"method": "upi", "points": 10000, "upi_id": "phase2@upi"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["points"] == 10000
        # Verify deduction
        me = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        assert me["points"] == 20000, me


# ---------- Regression: campaigns exchange ratio ----------
class TestRegressionExchangeRatio:
    def test_reward_inr_respects_exchange_ratio(self, http, admin_tok):
        original = http.get(
            f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_tok)
        ).json()
        try:
            for ratio, expected_inr in [(100, 5.0), (50, 10.0), (200, 2.5)]:
                payload = copy.deepcopy(original)
                payload["exchange_points_per_inr"] = ratio
                r = http.put(
                    f"{BASE_URL}/api/admin/app-config",
                    headers=_hdr(admin_tok), json=payload,
                )
                assert r.status_code == 200, r.text
                items = http.get(f"{BASE_URL}/api/campaigns").json()
                # Find any campaign with reward_points 500 OR check that formula holds for first item.
                assert isinstance(items, list) and len(items) > 0, items
                for c in items:
                    rp = c.get("reward_points") or 0
                    exp = round(rp / ratio, 2)
                    assert c.get("reward_inr") == exp, (
                        f"ratio={ratio} rp={rp} got={c.get('reward_inr')} exp={exp}"
                    )
        finally:
            http.put(
                f"{BASE_URL}/api/admin/app-config",
                headers=_hdr(admin_tok), json=original,
            )


# ---------- Regression: surveys limit=1 ----------
class TestRegressionSurveysLimit:
    def test_surveys_random_limit_one(self, http):
        tok, _ = _device_login(http)
        r = http.get(
            f"{BASE_URL}/api/tasks/surveys/random?limit=1", headers=_hdr(tok)
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # response could be {"surveys": [...]} or list
        surveys = body.get("surveys") if isinstance(body, dict) else body
        assert isinstance(surveys, list)
        assert len(surveys) == 1, f"expected 1 got {len(surveys)}"
        assert isinstance(surveys[0].get("questions"), list)
