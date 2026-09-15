"""Iteration 35 - Bugfix verification tests.

Covers:
1) BUGFIX 2 E2E: campaign reward 1000 -> user submits proof -> admin partial-approve 400
   with custom_exchange_ratio=500. Verify /api/withdraw/history has exactly one
   successful source=campaign record for 1000 pts with INR 2.00, and
   /api/wallet/transactions has a source=withdraw/category=campaign/-1000 ledger row.
2) Regression: FULL approval (approved_points omitted) must NOT create an
   automatic withdrawal history row.
3) Zero approval (approved_points=0) MUST create the auto withdrawal row.
4) BUGFIX 1 backend dependency: /auth/me exposes custom_exchange_ratio and
   custom_withdraw_amounts so the Withdraw screen can refresh chips on focus.
"""
import time
import pytest

BASE = "/api"


def _ok(r):
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    return r.json()


def _mk_campaign(api, base_url, admin_session, reward=1000):
    camp = _ok(api.post(
        f"{base_url}{BASE}/admin/campaigns",
        json={
            "name": f"TEST_I35_{int(time.time()*1000)}",
            "note": "iter35",
            "logo_url": "https://x.png",
            "link_url": "https://x",
            "reward_points": reward,
            "category": "Campaigns",
            "difficulty": "Easy",
            "active": True,
        },
        headers=admin_session["headers"],
    ))
    return camp["id"]


def _submit(api, base_url, user_session, mongo_db, cid):
    r = api.post(
        f"{base_url}{BASE}/tasks/campaign/{cid}/submit",
        json={"form_field_1_value": "user@upi", "form_field_2_value": "Holder Name"},
        headers=user_session["headers"],
    )
    assert r.status_code == 200, r.text
    completion = mongo_db.campaign_completions.find_one(
        {"user_id": user_session["user_id"], "campaign_id": cid}
    )
    assert completion is not None
    return completion


class TestPartialApprovalAutoWithdrawal:
    """BUGFIX 2 - partial approval creates withdrawal history + ledger row"""

    def test_partial_approve_400_creates_successful_withdrawal_and_ledger(
        self, api, base_url, admin_session, user_session, mongo_db
    ):
        uid = user_session["user_id"]
        _ok(api.put(
            f"{base_url}{BASE}/admin/users/{uid}/overrides",
            json={"custom_exchange_ratio": 500, "custom_withdraw_amounts": [100, 500, 1000]},
            headers=admin_session["headers"],
        ))
        cid = _mk_campaign(api, base_url, admin_session, reward=1000)
        try:
            completion = _submit(api, base_url, user_session, mongo_db, cid)
            _ok(api.put(
                f"{base_url}{BASE}/admin/campaign-completions/{completion['id']}",
                json={"status": "approved", "admin_note": "", "approved_points": 400},
                headers=admin_session["headers"],
            ))

            # /api/withdraw/history - exactly one successful campaign row, 1000 pts, INR 2.00
            history = _ok(api.get(f"{base_url}{BASE}/withdraw/history", headers=user_session["headers"]))
            auto = [w for w in history if w.get("completion_id") == completion["id"]]
            assert len(auto) == 1, f"expected 1 auto withdrawal, got {len(auto)}"
            row = auto[0]
            assert row["status"] == "successful"
            assert row["source"] == "campaign"
            assert row["points"] == 1000
            assert abs(float(row["inr_amount"]) - 2.00) < 0.01, row["inr_amount"]
            assert row.get("auto_created") is True

            # /api/wallet/transactions - source=withdraw/category=campaign/-1000 row
            ledger = _ok(api.get(f"{base_url}{BASE}/wallet/transactions", headers=user_session["headers"]))
            rows = [t for t in ledger
                    if t.get("source") == "withdraw" and t.get("category") == "campaign"
                    and t.get("points") == -1000]
            assert len(rows) == 1, f"expected 1 ledger row, got {len(rows)}"
            assert "paid externally" in rows[0].get("note", "").lower()

            # User wallet credited with the 400 approved points
            u = mongo_db.users.find_one({"user_id": uid})
            assert int(u.get("points", 0)) >= 400
        finally:
            mongo_db.campaigns.delete_one({"id": cid})


class TestFullApprovalNoAutoWithdrawal:
    """Regression - full approval must NOT create an auto withdrawal row"""

    def test_full_approval_creates_no_withdrawal_row(
        self, api, base_url, admin_session, user_session, mongo_db
    ):
        uid = user_session["user_id"]
        cid = _mk_campaign(api, base_url, admin_session, reward=1000)
        try:
            completion = _submit(api, base_url, user_session, mongo_db, cid)
            _ok(api.put(
                f"{base_url}{BASE}/admin/campaign-completions/{completion['id']}",
                json={"status": "approved", "admin_note": "full ok"},
                headers=admin_session["headers"],
            ))
            history = _ok(api.get(f"{base_url}{BASE}/withdraw/history", headers=user_session["headers"]))
            auto = [w for w in history if w.get("completion_id") == completion["id"]]
            assert len(auto) == 0, f"full approval must not auto-create withdrawal, got {auto}"
            ledger = _ok(api.get(f"{base_url}{BASE}/wallet/transactions", headers=user_session["headers"]))
            rows = [t for t in ledger if t.get("source") == "withdraw" and t.get("category") == "campaign"]
            assert len(rows) == 0, f"full approval must not log withdraw ledger row, got {rows}"
        finally:
            mongo_db.campaigns.delete_one({"id": cid})


class TestZeroApprovalAutoWithdrawal:
    """Zero approval (approved_points=0) MUST create the auto withdrawal row"""

    def test_zero_approval_creates_withdrawal_row(
        self, api, base_url, admin_session, user_session, mongo_db
    ):
        uid = user_session["user_id"]
        _ok(api.put(
            f"{base_url}{BASE}/admin/users/{uid}/overrides",
            json={"custom_exchange_ratio": 500, "custom_withdraw_amounts": None},
            headers=admin_session["headers"],
        ))
        cid = _mk_campaign(api, base_url, admin_session, reward=1000)
        try:
            completion = _submit(api, base_url, user_session, mongo_db, cid)
            _ok(api.put(
                f"{base_url}{BASE}/admin/campaign-completions/{completion['id']}",
                json={"status": "approved", "admin_note": "", "approved_points": 0},
                headers=admin_session["headers"],
            ))
            history = _ok(api.get(f"{base_url}{BASE}/withdraw/history", headers=user_session["headers"]))
            auto = [w for w in history if w.get("completion_id") == completion["id"]]
            assert len(auto) == 1, f"zero approval should auto-create withdrawal, got {len(auto)}"
            assert auto[0]["status"] == "successful"
            assert auto[0]["points"] == 1000
            assert abs(float(auto[0]["inr_amount"]) - 2.00) < 0.01
        finally:
            mongo_db.campaigns.delete_one({"id": cid})


class TestAuthMeExposesOverrides:
    """BUGFIX 1 backend dependency - /auth/me returns per-user overrides"""

    def test_auth_me_returns_custom_overrides(self, api, base_url, admin_session, user_session):
        uid = user_session["user_id"]
        _ok(api.put(
            f"{base_url}{BASE}/admin/users/{uid}/overrides",
            json={"custom_exchange_ratio": 500, "custom_withdraw_amounts": [100, 500, 1000]},
            headers=admin_session["headers"],
        ))
        me = _ok(api.get(f"{base_url}{BASE}/auth/me", headers=user_session["headers"]))
        assert int(me.get("custom_exchange_ratio")) == 500
        assert list(me.get("custom_withdraw_amounts")) == [100, 500, 1000]
        assert "has_first_withdrawal" in me
