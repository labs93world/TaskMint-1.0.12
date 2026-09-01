"""Iteration 27 — Full backend regression for TaskMint.

Covers: auth (device / me / admin login+logout), public content endpoints
(banners, campaigns, earn-cards, profile-buttons, withdraw-settings, links,
maintenance, app-config, version, admob-settings), tasks (checkin, spin+claim,
scratch+claim, watch, visit + completed-today), referrals (me + apply),
wallet + withdraw (min, daily-cap, wallet-split), campaign task submission +
completions listing, and admin endpoints (users, campaign CRUD,
campaign-completions approve/reject, withdrawals approve/reject, settings
config updates, admob-settings).
"""
import os
import uuid
import time
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

_FE = dotenv_values("/app/frontend/.env")
_BE = dotenv_values("/app/backend/.env")

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or _FE.get("EXPO_PUBLIC_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _BE.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _BE.get("DB_NAME") or "test_database"
ADMIN_EMAIL = _BE.get("ADMIN_EMAIL", "93altaff@gmail.com")
ADMIN_PASSWORD = _BE.get("ADMIN_PASSWORD", "9372@Altaf93")

TIMEOUT = 30


# ---------- Helpers ----------
def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _device_login(session, device_id=None):
    device_id = device_id or f"TEST_dev_{uuid.uuid4().hex[:12]}"
    r = session.post(
        f"{BASE_URL}/api/auth/device",
        json={"device_id": device_id, "fingerprint": f"TEST_fp_{device_id}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return body["session_token"], body["user"]["user_id"]


class _NoCookieClient:
    """Wrapper over requests that intentionally drops Set-Cookie so tokens
    only travel via the Authorization header. The server's `get_current_user`
    prefers `session_token` cookie over the Authorization header, so a shared
    requests.Session leaks the last-authenticated user across tests."""
    def _do(self, method, url, **kw):
        kw.setdefault("timeout", TIMEOUT)
        return requests.request(method, url, **kw)
    def get(self, url, **kw): return self._do("GET", url, **kw)
    def post(self, url, **kw): return self._do("POST", url, **kw)
    def put(self, url, **kw): return self._do("PUT", url, **kw)
    def delete(self, url, **kw): return self._do("DELETE", url, **kw)


@pytest.fixture(scope="session")
def http():
    return _NoCookieClient()


@pytest.fixture(scope="session")
def mongo_db():
    if not MONGO_URL:
        pytest.skip("no MONGO_URL")
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="session")
def device_ctx(http):
    """Fresh device user for the whole regression run."""
    token, uid = _device_login(http)
    yield {"token": token, "user_id": uid}


@pytest.fixture(scope="session")
def admin_ctx(http):
    """A separate device session promoted to admin. Kept isolated so the
    device_ctx keeps device-user semantics for task/wallet tests."""
    token, uid = _device_login(http)
    r = http.post(
        f"{BASE_URL}/api/auth/admin-login",
        headers=_headers(token),
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    yield {"token": token, "device_user_id": uid}


# ---------- Auth ----------
class TestAuth:
    def test_device_login_creates_user(self, http):
        did = f"TEST_dev_{uuid.uuid4().hex[:10]}"
        r = http.post(f"{BASE_URL}/api/auth/device",
                      json={"device_id": did, "fingerprint": f"fp_{did}"},
                      timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "session_token" in body and body["session_token"]
        assert body["user"]["user_id"].startswith("user_")

    def test_device_login_returns_same_user(self, http):
        did = f"TEST_dev_{uuid.uuid4().hex[:10]}"
        r1 = http.post(f"{BASE_URL}/api/auth/device", json={"device_id": did}, timeout=TIMEOUT)
        r2 = http.post(f"{BASE_URL}/api/auth/device", json={"device_id": did}, timeout=TIMEOUT)
        assert r1.json()["user"]["user_id"] == r2.json()["user"]["user_id"]

    def test_device_login_invalid_id(self, http):
        r = http.post(f"{BASE_URL}/api/auth/device", json={"device_id": "abc"}, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_auth_me(self, http, device_ctx):
        r = http.get(f"{BASE_URL}/api/auth/me", headers=_headers(device_ctx["token"]), timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["user_id"] == device_ctx["user_id"]

    def test_auth_me_unauthorized(self, http):
        r = http.get(f"{BASE_URL}/api/auth/me", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_admin_login_wrong_password(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/auth/admin-login", headers=_headers(tok),
                      json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=TIMEOUT)
        assert r.status_code == 401

    def test_admin_login_and_logout(self, http):
        tok, orig_uid = _device_login(http)
        r = http.post(f"{BASE_URL}/api/auth/admin-login", headers=_headers(tok),
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["is_admin"] is True
        assert u["user_id"] == "admin_altaff"

        # /me now returns admin identity via same token
        me = http.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok), timeout=TIMEOUT).json()
        assert me["user_id"] == "admin_altaff" and me["is_admin"] is True

        # logout restores original device user
        r_out = http.post(f"{BASE_URL}/api/auth/admin-logout", headers=_headers(tok), timeout=TIMEOUT)
        assert r_out.status_code == 200
        assert r_out.json()["user"]["user_id"] == orig_uid


# ---------- Public content ----------
class TestPublic:
    def test_banners(self, http):
        r = http.get(f"{BASE_URL}/api/banners", timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_campaigns(self, http):
        r = http.get(f"{BASE_URL}/api/campaigns", timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_earn_cards_wrapper(self, http):
        r = http.get(f"{BASE_URL}/api/earn-cards", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict) and "cards" in body
        assert isinstance(body["cards"], list) and len(body["cards"]) >= 1

    def test_profile_buttons_wrapper(self, http):
        r = http.get(f"{BASE_URL}/api/profile-buttons", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict) and "buttons" in body
        assert isinstance(body["buttons"], list)

    def test_withdraw_settings(self, http):
        r = http.get(f"{BASE_URL}/api/withdraw-settings", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        for k in ("amounts", "exchange_points_per_inr",
                  "min_withdrawal_campaign", "min_withdrawal_games_task",
                  "daily_withdrawal_limit"):
            assert k in body, f"missing {k}"

    def test_links(self, http):
        r = http.get(f"{BASE_URL}/api/links", timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), dict)

    def test_maintenance(self, http):
        r = http.get(f"{BASE_URL}/api/maintenance", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "maintenance" in r.json()

    def test_app_config(self, http):
        r = http.get(f"{BASE_URL}/api/app-config", timeout=TIMEOUT)
        assert r.status_code == 200
        cfg = r.json()
        for k in ("spin_min", "spin_max", "checkin_base",
                  "min_withdrawal_games_task", "exchange_points_per_inr",
                  "daily_challenge_common", "daily_challenge_jackpot"):
            assert k in cfg

    def test_version(self, http):
        r = http.get(f"{BASE_URL}/api/version", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert "latest_version" in body and "min_supported_version" in body

    def test_admob_settings_public(self, http):
        r = http.get(f"{BASE_URL}/api/admob-settings", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "android_app_id" in r.json()


# ---------- Tasks ----------
class TestTasks:
    def test_checkin_first_and_duplicate(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/checkin", headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["streak"] == 1 and body["reward"] > 0

        r2 = http.post(f"{BASE_URL}/api/tasks/checkin", headers=_headers(tok), timeout=TIMEOUT)
        assert r2.status_code == 400  # already checked in today

    def test_spin_and_claim(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/spin", headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reward"] > 0

        # Second spin blocked until claim
        r2 = http.post(f"{BASE_URL}/api/tasks/spin", headers=_headers(tok), timeout=TIMEOUT)
        assert r2.status_code == 400

        rc = http.post(f"{BASE_URL}/api/tasks/spin/claim", headers=_headers(tok), timeout=TIMEOUT)
        assert rc.status_code == 200
        assert rc.json()["reward"] == body["reward"]

        # After claim, spin allowed again
        r3 = http.post(f"{BASE_URL}/api/tasks/spin", headers=_headers(tok), timeout=TIMEOUT)
        assert r3.status_code == 200

    def test_scratch_and_claim(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/scratch", headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200
        pending = r.json()["reward"]
        assert pending > 0

        rc = http.post(f"{BASE_URL}/api/tasks/scratch/claim", headers=_headers(tok), timeout=TIMEOUT)
        assert rc.status_code == 200 and rc.json()["reward"] == pending

    def test_watch_earn(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/watch", headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reward"] > 0 and body["cycle_used"] == 1

    def test_visit_completed_today_empty(self, http):
        tok, _ = _device_login(http)
        r = http.get(f"{BASE_URL}/api/tasks/visit/completed-today",
                     headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json() == {"site_ids": []}


# ---------- Referrals ----------
class TestReferrals:
    def test_referrals_me(self, http):
        tok, _ = _device_login(http)
        r = http.get(f"{BASE_URL}/api/referrals/me", headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        assert body["referral_code"] and body["referred_by"] in (None, "")
        assert body["count"] == 0
        assert body["can_apply"] is True

    def test_apply_referral_code_flow(self, http):
        # A referrer (has code)
        tok_a, _ = _device_login(http)
        code = http.get(f"{BASE_URL}/api/referrals/me",
                        headers=_headers(tok_a), timeout=TIMEOUT).json()["referral_code"]

        # Fresh user applies A's code
        tok_b, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/referrals/apply",
                      headers=_headers(tok_b), json={"code": code}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

        # Second apply blocked
        r2 = http.post(f"{BASE_URL}/api/referrals/apply",
                       headers=_headers(tok_b), json={"code": code}, timeout=TIMEOUT)
        assert r2.status_code == 400

    def test_apply_invalid_code(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/referrals/apply",
                      headers=_headers(tok), json={"code": "NOPE_XYZ"}, timeout=TIMEOUT)
        assert r.status_code == 404

    def test_apply_own_code_blocked(self, http):
        tok, _ = _device_login(http)
        my_code = http.get(f"{BASE_URL}/api/referrals/me",
                           headers=_headers(tok), timeout=TIMEOUT).json()["referral_code"]
        r = http.post(f"{BASE_URL}/api/referrals/apply",
                      headers=_headers(tok), json={"code": my_code}, timeout=TIMEOUT)
        assert r.status_code == 400


# ---------- Wallet / Withdraw ----------
class TestWithdraw:
    def _prep_wallet(self, mongo_db, uid, campaign_pts=0, games_pts=0, mobile="+919876543210"):
        mongo_db.users.update_one(
            {"user_id": uid},
            {"$set": {
                "campaign_points": campaign_pts,
                "games_task_points": games_pts,
                "points": campaign_pts + games_pts,
                "mobile_number": mobile,
                "withdrawals_today": 0,
                "withdrawals_today_date": None,
            }},
        )

    def test_withdraw_requires_mobile(self, http, mongo_db):
        tok, uid = _device_login(http)
        self._prep_wallet(mongo_db, uid, games_pts=20000, mobile=None)
        r = http.post(f"{BASE_URL}/api/withdraw",
                      headers=_headers(tok),
                      json={"method": "upi", "source": "games_task", "points": 10000,
                            "upi_id": "test@upi"}, timeout=TIMEOUT)
        assert r.status_code == 400
        assert "mobile" in r.json()["detail"].lower()

    def test_withdraw_min_amount(self, http, mongo_db):
        tok, uid = _device_login(http)
        self._prep_wallet(mongo_db, uid, games_pts=20000)
        r = http.post(f"{BASE_URL}/api/withdraw",
                      headers=_headers(tok),
                      json={"method": "upi", "source": "games_task", "points": 500,
                            "upi_id": "test@upi"}, timeout=TIMEOUT)
        assert r.status_code == 400
        assert "minimum" in r.json()["detail"].lower()

    def test_withdraw_wallet_split_enforced(self, http, mongo_db):
        """Try to withdraw from campaign bucket with no campaign points."""
        tok, uid = _device_login(http)
        self._prep_wallet(mongo_db, uid, campaign_pts=0, games_pts=20000)
        r = http.post(f"{BASE_URL}/api/withdraw",
                      headers=_headers(tok),
                      json={"method": "upi", "source": "campaign", "points": 10000,
                            "upi_id": "test@upi"}, timeout=TIMEOUT)
        assert r.status_code == 400
        assert "insufficient" in r.json()["detail"].lower()

    def test_withdraw_success_and_daily_cap(self, http, mongo_db):
        tok, uid = _device_login(http)
        self._prep_wallet(mongo_db, uid, games_pts=60000)

        # Read daily cap from app-config
        cfg = http.get(f"{BASE_URL}/api/app-config", timeout=TIMEOUT).json()
        cap = int(cfg.get("daily_withdrawal_limit", 2))

        for i in range(cap):
            r = http.post(f"{BASE_URL}/api/withdraw",
                          headers=_headers(tok),
                          json={"method": "upi", "source": "games_task", "points": 10000,
                                "upi_id": "test@upi"}, timeout=TIMEOUT)
            assert r.status_code == 200, f"iter {i}: {r.text}"
            body = r.json()
            assert body["status"] == "pending"
            assert body["source"] == "games_task"
            assert body["inr_amount"] > 0

        # (cap+1)th call rejected
        r_over = http.post(f"{BASE_URL}/api/withdraw",
                           headers=_headers(tok),
                           json={"method": "upi", "source": "games_task", "points": 10000,
                                 "upi_id": "test@upi"}, timeout=TIMEOUT)
        assert r_over.status_code == 400
        assert "daily" in r_over.json()["detail"].lower()

        # Bucket properly deducted
        me = http.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok), timeout=TIMEOUT).json()
        assert me["games_task_points"] == 60000 - 10000 * cap

    def test_withdraw_history(self, http, mongo_db):
        tok, uid = _device_login(http)
        self._prep_wallet(mongo_db, uid, games_pts=20000)
        http.post(f"{BASE_URL}/api/withdraw", headers=_headers(tok),
                  json={"method": "upi", "source": "games_task", "points": 10000,
                        "upi_id": "test@upi"}, timeout=TIMEOUT)
        r = http.get(f"{BASE_URL}/api/withdraw/history",
                     headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 200
        assert len(r.json()) >= 1


# ---------- Campaign submission + completions listing ----------
class TestCampaigns:
    @pytest.fixture(scope="class")
    def a_campaign(self, http, admin_ctx, mongo_db):
        payload = {
            "name": "TEST_Campaign",
            "note": "TEST",
            "logo_url": "https://x/y.png",
            "link_url": "https://x/y",
            "reward_points": 500,
            "category": "App Install",
            "difficulty": "Easy",
            "active": True,
        }
        r = http.post(f"{BASE_URL}/api/admin/campaigns",
                      headers=_headers(admin_ctx["token"]),
                      json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        yield cid
        mongo_db.campaigns.delete_one({"id": cid})
        mongo_db.campaign_completions.delete_many({"campaign_id": cid})

    def test_submit_and_list_completion(self, http, a_campaign):
        tok, uid = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/campaign/{a_campaign}/submit",
                      headers=_headers(tok),
                      json={"form_field_1_value": "ref-1"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"

        r_list = http.get(f"{BASE_URL}/api/campaign-completions",
                          headers=_headers(tok), timeout=TIMEOUT)
        assert r_list.status_code == 200
        rows = r_list.json()
        assert any(row["campaign_id"] == a_campaign and row["status"] == "pending" for row in rows)

    def test_duplicate_submit_blocked(self, http, a_campaign):
        tok, _ = _device_login(http)
        http.post(f"{BASE_URL}/api/tasks/campaign/{a_campaign}/submit",
                  headers=_headers(tok), json={}, timeout=TIMEOUT)
        r = http.post(f"{BASE_URL}/api/tasks/campaign/{a_campaign}/submit",
                      headers=_headers(tok), json={}, timeout=TIMEOUT)
        assert r.status_code == 400


# ---------- Admin endpoints ----------
class TestAdmin:
    def test_requires_admin(self, http):
        tok, _ = _device_login(http)
        r = http.get(f"{BASE_URL}/api/admin/users",
                     headers=_headers(tok), timeout=TIMEOUT)
        assert r.status_code == 403

    def test_admin_users_list(self, http, admin_ctx):
        r = http.get(f"{BASE_URL}/api/admin/users",
                     headers=_headers(admin_ctx["token"]), timeout=TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_stats(self, http, admin_ctx):
        r = http.get(f"{BASE_URL}/api/admin/stats",
                     headers=_headers(admin_ctx["token"]), timeout=TIMEOUT)
        assert r.status_code == 200
        assert "users" in r.json()

    def test_admin_campaign_crud(self, http, admin_ctx, mongo_db):
        create = http.post(f"{BASE_URL}/api/admin/campaigns",
                           headers=_headers(admin_ctx["token"]),
                           json={"name": "TEST_C", "note": "x", "logo_url": "https://a/b.png",
                                 "reward_points": 200, "category": "App Install",
                                 "difficulty": "Easy", "active": True}, timeout=TIMEOUT)
        assert create.status_code == 200
        cid = create.json()["id"]

        upd = http.put(f"{BASE_URL}/api/admin/campaigns/{cid}",
                       headers=_headers(admin_ctx["token"]),
                       json={"name": "TEST_C2", "note": "x", "logo_url": "https://a/b.png",
                             "reward_points": 300, "category": "App Install",
                             "difficulty": "Easy", "active": True}, timeout=TIMEOUT)
        assert upd.status_code == 200

        # Verify persisted
        listed = http.get(f"{BASE_URL}/api/admin/campaigns",
                          headers=_headers(admin_ctx["token"]), timeout=TIMEOUT).json()
        row = next(x for x in listed if x["id"] == cid)
        assert row["name"] == "TEST_C2" and row["reward_points"] == 300

        # Delete
        rd = http.delete(f"{BASE_URL}/api/admin/campaigns/{cid}",
                         headers=_headers(admin_ctx["token"]), timeout=TIMEOUT)
        assert rd.status_code == 200
        mongo_db.campaigns.delete_one({"id": cid})  # safety

    def test_admin_completion_approve_credits_user(self, http, admin_ctx, mongo_db):
        # Create campaign
        create = http.post(f"{BASE_URL}/api/admin/campaigns",
                           headers=_headers(admin_ctx["token"]),
                           json={"name": "TEST_APR", "note": "x", "logo_url": "https://a/b.png",
                                 "reward_points": 400, "category": "App Install",
                                 "difficulty": "Easy", "active": True}, timeout=TIMEOUT)
        cid = create.json()["id"]

        tok, uid = _device_login(http)
        http.post(f"{BASE_URL}/api/tasks/campaign/{cid}/submit",
                  headers=_headers(tok), json={}, timeout=TIMEOUT)
        completions = http.get(f"{BASE_URL}/api/admin/campaign-completions",
                               headers=_headers(admin_ctx["token"]), timeout=TIMEOUT).json()
        pending = next(c for c in completions if c["user_id"] == uid and c["campaign_id"] == cid)

        r = http.put(f"{BASE_URL}/api/admin/campaign-completions/{pending['id']}",
                     headers=_headers(admin_ctx["token"]),
                     json={"status": "approved", "admin_note": "ok"}, timeout=TIMEOUT)
        assert r.status_code == 200

        me = http.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok), timeout=TIMEOUT).json()
        assert me["campaign_points"] >= 400
        assert me["points"] >= 400

        # cleanup
        mongo_db.campaigns.delete_one({"id": cid})
        mongo_db.campaign_completions.delete_many({"campaign_id": cid})

    def test_admin_withdraw_approve_reject(self, http, admin_ctx, mongo_db):
        # Create user with points + a pending withdrawal
        tok, uid = _device_login(http)
        mongo_db.users.update_one({"user_id": uid}, {"$set": {
            "games_task_points": 20000, "points": 20000,
            "mobile_number": "+919000000000",
            "withdrawals_today": 0, "withdrawals_today_date": None,
        }})
        r = http.post(f"{BASE_URL}/api/withdraw", headers=_headers(tok),
                      json={"method": "upi", "source": "games_task", "points": 10000,
                            "upi_id": "abc@upi"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        wd_id = r.json()["id"]

        # Reject → refunds points
        rr = http.put(f"{BASE_URL}/api/admin/withdrawals/{wd_id}",
                      headers=_headers(admin_ctx["token"]),
                      json={"status": "rejected", "admin_note": "test"}, timeout=TIMEOUT)
        assert rr.status_code == 200

        me = http.get(f"{BASE_URL}/api/auth/me", headers=_headers(tok), timeout=TIMEOUT).json()
        assert me["games_task_points"] == 20000, f"refund failed: {me['games_task_points']}"

        # Second withdrawal for approval flow
        r2 = http.post(f"{BASE_URL}/api/withdraw", headers=_headers(tok),
                       json={"method": "upi", "source": "games_task", "points": 10000,
                             "upi_id": "abc@upi"}, timeout=TIMEOUT)
        wd2 = r2.json()["id"]
        ra = http.put(f"{BASE_URL}/api/admin/withdrawals/{wd2}",
                      headers=_headers(admin_ctx["token"]),
                      json={"status": "successful", "admin_note": "paid"}, timeout=TIMEOUT)
        assert ra.status_code == 200

    def test_admin_app_config_update_roundtrip(self, http, admin_ctx):
        cur = http.get(f"{BASE_URL}/api/admin/app-config",
                       headers=_headers(admin_ctx["token"]), timeout=TIMEOUT).json()
        cur["spin_min"] = 30
        cur["spin_max"] = 100
        upd = http.put(f"{BASE_URL}/api/admin/app-config",
                       headers=_headers(admin_ctx["token"]),
                       json=cur, timeout=TIMEOUT)
        assert upd.status_code == 200
        again = http.get(f"{BASE_URL}/api/app-config", timeout=TIMEOUT).json()
        assert again["spin_min"] == 30 and again["spin_max"] == 100

    def test_admin_admob_settings_roundtrip(self, http, admin_ctx):
        cur = http.get(f"{BASE_URL}/api/admin/admob-settings",
                       headers=_headers(admin_ctx["token"]), timeout=TIMEOUT).json()
        upd = http.put(f"{BASE_URL}/api/admin/admob-settings",
                       headers=_headers(admin_ctx["token"]),
                       json=cur, timeout=TIMEOUT)
        assert upd.status_code == 200

    def test_admin_meta_endpoints_settings(self, http, admin_ctx):
        # withdraw-settings
        cur = http.get(f"{BASE_URL}/api/admin/withdraw-settings",
                       headers=_headers(admin_ctx["token"]), timeout=TIMEOUT).json()
        upd = http.put(f"{BASE_URL}/api/admin/withdraw-settings",
                       headers=_headers(admin_ctx["token"]),
                       json=cur, timeout=TIMEOUT)
        assert upd.status_code == 200

        # referral-settings
        ref = http.get(f"{BASE_URL}/api/admin/referral-settings",
                       headers=_headers(admin_ctx["token"]), timeout=TIMEOUT).json()
        ref.setdefault("streak_7_reward_points", 1000)
        ref.setdefault("streak_15_reward_points", 2000)
        upd2 = http.put(f"{BASE_URL}/api/admin/referral-settings",
                        headers=_headers(admin_ctx["token"]),
                        json=ref, timeout=TIMEOUT)
        assert upd2.status_code == 200
