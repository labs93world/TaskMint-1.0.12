"""Iteration 28 — Phase 1 single-wallet overhaul.

Covers:
- POST /api/withdraw no longer requires `source`; validates against user.points +
  meta.min_withdrawal, deducts points, refunds on rejection.
- GET /api/withdraw-settings returns `min_withdrawal`.
- Live exchange ratio: PUT /api/admin/app-config -> GET /api/campaigns &
  GET /api/campaign/{id} return reward_inr = reward_points / ratio.
- GET /api/tasks/surveys/random?limit=1 returns exactly 1 survey; POST
  /api/tasks/survey credits + increments daily_surveys_used.
- Regression: device login, /auth/me, checkin, spin+claim,
  campaign submit + admin approve credits user.points, /wallet/transactions
- Admin approve/reject withdrawal (single-wallet).
"""
import os
import uuid
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


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class _NoCookie:
    """Bypass shared session so tokens travel only via Authorization header."""
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
def admin_ctx(http):
    tok, uid = _device_login(http)
    r = http.post(
        f"{BASE_URL}/api/auth/admin-login",
        headers=_hdr(tok),
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    yield {"token": tok, "device_user_id": uid}


# ---------- Withdraw settings ----------
class TestWithdrawSettings:
    def test_withdraw_settings_has_min_withdrawal(self, http):
        r = http.get(f"{BASE_URL}/api/withdraw-settings")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "min_withdrawal" in body, body
        assert isinstance(body["min_withdrawal"], int)
        assert body["min_withdrawal"] > 0
        # backward-compat legacy fields still present:
        assert "exchange_points_per_inr" in body
        assert "amounts" in body
        assert "daily_withdrawal_limit" in body


# ---------- Single-wallet withdraw ----------
class TestSingleWalletWithdraw:
    def _prep(self, mongo_db, uid, points=60000, mobile="+919000000000"):
        mongo_db.users.update_one(
            {"user_id": uid},
            {"$set": {
                "points": points,
                "campaign_points": 0,
                "games_task_points": points,
                "mobile_number": mobile,
                "withdrawals_today": 0,
                "withdrawals_today_date": None,
            }},
        )

    def test_withdraw_no_source_required(self, http, mongo_db):
        """Payload without `source` must still work (single-wallet)."""
        tok, uid = _device_login(http)
        self._prep(mongo_db, uid, points=20000)
        r = http.post(
            f"{BASE_URL}/api/withdraw",
            headers=_hdr(tok),
            json={"method": "upi", "points": 10000, "upi_id": "phase1@upi"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["points"] == 10000
        assert body["inr_amount"] == 100.0
        # user.points must be deducted
        me = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        assert me["points"] == 10000, me

    def test_withdraw_below_min_rejected(self, http, mongo_db):
        tok, uid = _device_login(http)
        self._prep(mongo_db, uid, points=20000)
        r = http.post(
            f"{BASE_URL}/api/withdraw",
            headers=_hdr(tok),
            json={"method": "upi", "points": 500, "upi_id": "x@upi"},
        )
        assert r.status_code == 400, r.text
        assert "minimum" in r.json()["detail"].lower()

    def test_withdraw_above_balance_rejected(self, http, mongo_db):
        tok, uid = _device_login(http)
        self._prep(mongo_db, uid, points=5000)   # under min anyway
        # give a below-balance amount that exceeds `points`
        mongo_db.users.update_one({"user_id": uid}, {"$set": {"points": 15000, "games_task_points": 15000}})
        r = http.post(
            f"{BASE_URL}/api/withdraw",
            headers=_hdr(tok),
            json={"method": "upi", "points": 20000, "upi_id": "x@upi"},
        )
        assert r.status_code == 400, r.text
        assert "insufficient" in r.json()["detail"].lower()

    def test_withdraw_reject_refunds_points(self, http, mongo_db, admin_ctx):
        tok, uid = _device_login(http)
        self._prep(mongo_db, uid, points=20000)
        # submit
        r = http.post(
            f"{BASE_URL}/api/withdraw",
            headers=_hdr(tok),
            json={"method": "upi", "points": 10000, "upi_id": "refund@upi"},
        )
        assert r.status_code == 200, r.text
        wd_id = r.json()["id"]
        me_before = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        assert me_before["points"] == 10000
        # admin rejects
        rr = http.put(
            f"{BASE_URL}/api/admin/withdrawals/{wd_id}",
            headers=_hdr(admin_ctx["token"]),
            json={"status": "rejected", "admin_note": "test refund"},
        )
        assert rr.status_code == 200, rr.text
        me_after = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        assert me_after["points"] == 20000, me_after

    def test_withdraw_admin_approve_succeeds(self, http, mongo_db, admin_ctx):
        tok, uid = _device_login(http)
        self._prep(mongo_db, uid, points=20000)
        r = http.post(
            f"{BASE_URL}/api/withdraw",
            headers=_hdr(tok),
            json={"method": "upi", "points": 10000, "upi_id": "approve@upi"},
        )
        wd_id = r.json()["id"]
        ra = http.put(
            f"{BASE_URL}/api/admin/withdrawals/{wd_id}",
            headers=_hdr(admin_ctx["token"]),
            json={"status": "successful", "admin_note": "paid"},
        )
        assert ra.status_code == 200, ra.text
        # After successful approval balance stays deducted (no refund)
        me = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        assert me["points"] == 10000


# ---------- Exchange ratio applied live ----------
class TestExchangeRatioAppliesLive:
    @pytest.fixture
    def a_campaign(self, http, admin_ctx, mongo_db):
        payload = {
            "name": "TEST_ExchRatio",
            "note": "TEST",
            "logo_url": "https://x/y.png",
            "reward_points": 500,
            "category": "App Install",
            "difficulty": "Easy",
            "active": True,
        }
        r = http.post(
            f"{BASE_URL}/api/admin/campaigns",
            headers=_hdr(admin_ctx["token"]),
            json=payload,
        )
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        yield cid
        mongo_db.campaigns.delete_one({"id": cid})

    def _set_ratio(self, http, admin_ctx, ratio):
        cfg = http.get(
            f"{BASE_URL}/api/admin/app-config", headers=_hdr(admin_ctx["token"])
        ).json()
        cfg["exchange_points_per_inr"] = ratio
        r = http.put(
            f"{BASE_URL}/api/admin/app-config",
            headers=_hdr(admin_ctx["token"]),
            json=cfg,
        )
        assert r.status_code == 200, r.text

    def test_campaigns_and_detail_reflect_ratio(self, http, admin_ctx, a_campaign):
        tok, _ = _device_login(http)
        # 1) default 100: 500 pts -> ₹5.0
        self._set_ratio(http, admin_ctx, 100)
        camps = http.get(f"{BASE_URL}/api/campaigns").json()
        row = next(c for c in camps if c["id"] == a_campaign)
        assert row["reward_inr"] == 5.0, row
        det = http.get(f"{BASE_URL}/api/campaign/{a_campaign}", headers=_hdr(tok)).json()
        assert det["reward_inr"] == 5.0, det

        # 2) set to 50: 500 / 50 = ₹10.0
        self._set_ratio(http, admin_ctx, 50)
        camps = http.get(f"{BASE_URL}/api/campaigns").json()
        row = next(c for c in camps if c["id"] == a_campaign)
        assert row["reward_inr"] == 10.0, row
        det = http.get(f"{BASE_URL}/api/campaign/{a_campaign}", headers=_hdr(tok)).json()
        assert det["reward_inr"] == 10.0, det

        # 3) set to 200: 500 / 200 = ₹2.5
        self._set_ratio(http, admin_ctx, 200)
        camps = http.get(f"{BASE_URL}/api/campaigns").json()
        row = next(c for c in camps if c["id"] == a_campaign)
        assert row["reward_inr"] == 2.5, row

        # 4) always reset back to 100 at end
        self._set_ratio(http, admin_ctx, 100)
        again = http.get(f"{BASE_URL}/api/withdraw-settings").json()
        assert again["exchange_points_per_inr"] == 100


# ---------- Surveys ----------
class TestSurveys:
    def test_random_returns_exactly_one(self, http):
        tok, _ = _device_login(http)
        r = http.get(f"{BASE_URL}/api/tasks/surveys/random?limit=1", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) == 1, items
        item = items[0]
        for k in ("id", "title", "time", "reward", "questions"):
            assert k in item, item
        assert isinstance(item["questions"], list) and len(item["questions"]) == 5

    def test_survey_complete_credits_and_increments(self, http, mongo_db):
        tok, uid = _device_login(http)
        # reset counter
        mongo_db.users.update_one({"user_id": uid}, {"$set": {"daily_surveys_used": 0}})
        me0 = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        p0 = int(me0.get("points", 0) or 0)
        r = http.post(f"{BASE_URL}/api/tasks/survey", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reward"] > 0
        me1 = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
        assert me1["points"] == p0 + body["reward"]
        assert me1.get("daily_surveys_used", 0) == 1


# ---------- Regression (single-wallet lens) ----------
class TestRegression:
    def test_device_login_and_me(self, http):
        tok, uid = _device_login(http)
        r = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["user_id"] == uid

    def test_checkin(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/checkin", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["streak"] == 1 and b["reward"] > 0

    def test_spin_and_claim(self, http):
        tok, _ = _device_login(http)
        r = http.post(f"{BASE_URL}/api/tasks/spin", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        pending = r.json()["reward"]
        rc = http.post(f"{BASE_URL}/api/tasks/spin/claim", headers=_hdr(tok))
        assert rc.status_code == 200
        assert rc.json()["reward"] == pending

    def test_wallet_transactions_returns_list(self, http):
        tok, _ = _device_login(http)
        # earn once so there's a row
        http.post(f"{BASE_URL}/api/tasks/checkin", headers=_hdr(tok))
        r = http.get(f"{BASE_URL}/api/wallet/transactions", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        for row in rows:
            for k in ("id", "type", "source", "points", "created_at"):
                assert k in row, row

    def test_campaign_submit_and_admin_approve_credits_points(
        self, http, admin_ctx, mongo_db
    ):
        # create
        cr = http.post(
            f"{BASE_URL}/api/admin/campaigns",
            headers=_hdr(admin_ctx["token"]),
            json={"name": "TEST_APR_P1", "note": "x", "logo_url": "https://a/b.png",
                  "reward_points": 400, "category": "App Install",
                  "difficulty": "Easy", "active": True},
        )
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]
        try:
            tok, uid = _device_login(http)
            me0 = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
            p0 = int(me0.get("points", 0) or 0)
            s = http.post(
                f"{BASE_URL}/api/tasks/campaign/{cid}/submit",
                headers=_hdr(tok),
                json={"form_field_1_value": "ref-1"},
            )
            assert s.status_code == 200, s.text
            # admin list & approve
            completions = http.get(
                f"{BASE_URL}/api/admin/campaign-completions",
                headers=_hdr(admin_ctx["token"]),
            ).json()
            pending = next(
                c for c in completions if c["user_id"] == uid and c["campaign_id"] == cid
            )
            ap = http.put(
                f"{BASE_URL}/api/admin/campaign-completions/{pending['id']}",
                headers=_hdr(admin_ctx["token"]),
                json={"status": "approved", "admin_note": "ok"},
            )
            assert ap.status_code == 200, ap.text
            me = http.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok)).json()
            # single-wallet: user.points should have been credited
            assert me["points"] == p0 + 400, me
        finally:
            mongo_db.campaigns.delete_one({"id": cid})
            mongo_db.campaign_completions.delete_many({"campaign_id": cid})
