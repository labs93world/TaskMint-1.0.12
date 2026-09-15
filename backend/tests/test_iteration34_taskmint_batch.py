"""Iteration 34 - TaskMint batch backend tests.

Covers:
1) Home tab order / default via /admin/app-config + public /app-config
2) Campaign cta_label persistence via /admin/campaigns + /campaign/{id}
3) Per-user overrides (custom_exchange_ratio, custom_withdraw_amounts) round-trip
4) Withdraw uses per-user exchange ratio (inr = points / customRatio)
5) Reset (DELETE) approved campaign completion deducts credited_points and logs a negative txn
6) Campaign approvals never auto-create withdrawal or ledger history
"""
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone


def _wait_ok(r):
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    return r.json()


# ---------- 1) App-config: home tab order + default ----------
class TestAppConfigHomeTabs:
    def test_public_app_config_has_home_tab_fields(self, api, base_url):
        r = api.get(f"{base_url}/api/app-config")
        data = _wait_ok(r)
        assert "home_default_tab" in data
        assert "home_tab_order" in data
        assert isinstance(data["home_tab_order"], list)
        assert set(data["home_tab_order"]) >= {"offerwall", "campaign"}

    def test_admin_put_app_config_roundtrip(self, api, base_url, admin_session):
        # Read current
        cur = _wait_ok(api.get(f"{base_url}/api/admin/app-config", headers=admin_session["headers"]))
        original_default = cur.get("home_default_tab", "offerwall")
        original_order = list(cur.get("home_tab_order") or ["offerwall", "campaign"])

        # Swap default to 'campaign' and reverse order
        new_order = ["campaign", "offerwall"]
        payload = dict(cur)
        payload["home_default_tab"] = "campaign"
        payload["home_tab_order"] = new_order
        r = api.put(f"{base_url}/api/admin/app-config", json=payload, headers=admin_session["headers"])
        _wait_ok(r)

        got = _wait_ok(api.get(f"{base_url}/api/admin/app-config", headers=admin_session["headers"]))
        assert got["home_default_tab"] == "campaign"
        assert got["home_tab_order"] == new_order

        # Public /app-config reflects too
        pub = _wait_ok(api.get(f"{base_url}/api/app-config"))
        assert pub["home_default_tab"] == "campaign"
        assert pub["home_tab_order"] == new_order

        # Reset back
        payload["home_default_tab"] = original_default
        payload["home_tab_order"] = original_order
        _wait_ok(api.put(f"{base_url}/api/admin/app-config", json=payload, headers=admin_session["headers"]))
        after = _wait_ok(api.get(f"{base_url}/api/admin/app-config", headers=admin_session["headers"]))
        assert after["home_default_tab"] == original_default
        assert after["home_tab_order"] == original_order


# ---------- 2) Campaign cta_label persistence ----------
class TestCampaignCtaLabel:
    def test_create_campaign_persists_cta_label_and_get_returns_it(
        self, api, base_url, admin_session, user_session, mongo_db
    ):
        payload = {
            "name": f"TEST_CTA_{int(time.time()*1000)}",
            "note": "cta test",
            "logo_url": "https://example.com/l.png",
            "link_url": "https://example.com",
            "cta_label": "Play Now",
            "reward_points": 500,
            "category": "App Install",
            "difficulty": "Easy",
            "active": True,
        }
        created = _wait_ok(
            api.post(f"{base_url}/api/admin/campaigns", json=payload, headers=admin_session["headers"])
        )
        cid = created["id"]
        assert created.get("cta_label") == "Play Now"

        # Edit label — PUT returns {ok:true}, verify via GET
        payload2 = dict(payload)
        payload2["cta_label"] = "Install & Earn"
        _wait_ok(
            api.put(
                f"{base_url}/api/admin/campaigns/{cid}",
                json=payload2,
                headers=admin_session["headers"],
            )
        )

        # GET /campaign/{id} (needs user auth) — must reflect edited cta_label
        got = _wait_ok(api.get(f"{base_url}/api/campaign/{cid}", headers=user_session["headers"]))
        assert got.get("cta_label") == "Install & Earn"

        # cleanup
        mongo_db.campaigns.delete_one({"id": cid})


# ---------- 3) Per-user overrides round-trip ----------
class TestPerUserOverrides:
    def test_set_get_clear_overrides(self, api, base_url, admin_session, user_session):
        uid = user_session["user_id"]
        # Set overrides
        payload = {"custom_exchange_ratio": 500, "custom_withdraw_amounts": [100, 500, 1000]}
        r = api.put(
            f"{base_url}/api/admin/users/{uid}/overrides",
            json=payload,
            headers=admin_session["headers"],
        )
        _wait_ok(r)

        got = _wait_ok(
            api.get(f"{base_url}/api/admin/users/{uid}", headers=admin_session["headers"])
        )
        assert int(got.get("custom_exchange_ratio")) == 500
        assert list(got.get("custom_withdraw_amounts")) == [100, 500, 1000]

        # Clear with nulls
        _wait_ok(
            api.put(
                f"{base_url}/api/admin/users/{uid}/overrides",
                json={"custom_exchange_ratio": None, "custom_withdraw_amounts": None},
                headers=admin_session["headers"],
            )
        )
        after = _wait_ok(
            api.get(f"{base_url}/api/admin/users/{uid}", headers=admin_session["headers"])
        )
        assert after.get("custom_exchange_ratio") in (None, 0)
        assert after.get("custom_withdraw_amounts") in (None, [])


# ---------- 4) Withdraw uses per-user ratio ----------
class TestWithdrawPerUserRatio:
    def test_withdraw_inr_uses_custom_ratio(
        self, api, base_url, admin_session, mongo_db
    ):
        # Create a user with enough balance + mobile set (mobile is required to withdraw)
        uid = f"user_TEST_wd_{uuid.uuid4().hex[:8]}"
        tok = f"TEST_tok_{uuid.uuid4().hex[:16]}"
        mongo_db.users.insert_one(
            {
                "user_id": uid,
                "email": f"TEST_wd_{uid}@example.com",
                "name": "WD User",
                "picture": "",
                "points": 20000,
                "games_task_points": 20000,
                "total_earned": 20000,
                "total_tasks": 0,
                "streak": 0,
                "has_first_withdrawal": True,  # skip first-withdrawal restrictions
                "is_admin": False,
                "mobile_number": "9876543210",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        mongo_db.user_sessions.insert_one(
            {
                "user_id": uid,
                "session_token": tok,
                "expires_at": datetime.now(timezone.utc).replace(microsecond=0),
                "created_at": datetime.now(timezone.utc),
            }
        )
        # Extend session expiry a week
        from datetime import timedelta
        mongo_db.user_sessions.update_one(
            {"session_token": tok},
            {"$set": {"expires_at": datetime.now(timezone.utc) + timedelta(days=7)}},
        )
        headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

        # Set per-user ratio = 500
        _wait_ok(
            api.put(
                f"{base_url}/api/admin/users/{uid}/overrides",
                json={"custom_exchange_ratio": 500, "custom_withdraw_amounts": None},
                headers=admin_session["headers"],
            )
        )

        # Ensure minimum withdrawal allows 10000 pts (default min=10000)
        pts = 10000
        r = api.post(
            f"{base_url}/api/withdraw",
            json={"method": "upi", "points": pts, "upi_id": "test@upi"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # inr = 10000 / 500 = 20.0
        assert abs(float(body.get("inr_amount", 0)) - 20.0) < 0.01, body

        # cleanup
        mongo_db.withdrawals.delete_many({"user_id": uid})
        mongo_db.transactions.delete_many({"user_id": uid})
        mongo_db.user_sessions.delete_many({"user_id": uid})
        mongo_db.users.delete_one({"user_id": uid})


# ---------- 5) Reset (DELETE) approved completion deducts credited_points ----------
class TestResetCompletion:
    def test_delete_approved_completion_deducts_points_and_logs(
        self, api, base_url, admin_session, user_session, mongo_db
    ):
        uid = user_session["user_id"]
        # Create a campaign
        camp = _wait_ok(
            api.post(
                f"{base_url}/api/admin/campaigns",
                json={
                    "name": f"TEST_RESET_{int(time.time()*1000)}",
                    "note": "reset test",
                    "logo_url": "https://x.png",
                    "link_url": "https://x",
                    "reward_points": 300,
                    "category": "App Install",
                    "difficulty": "Easy",
                    "active": True,
                },
                headers=admin_session["headers"],
            )
        )
        cid = camp["id"]

        # User submits completion (proof)
        r = api.post(
            f"{base_url}/api/tasks/campaign/{cid}/submit",
            json={"proof": "screenshot ok"},
            headers=user_session["headers"],
        )
        assert r.status_code == 200, r.text
        # Grab completion
        completion = mongo_db.campaign_completions.find_one(
            {"user_id": uid, "campaign_id": cid}
        )
        assert completion is not None
        compl_id = completion["id"]

        # Approve it
        _wait_ok(
            api.put(
                f"{base_url}/api/admin/campaign-completions/{compl_id}",
                json={"status": "approved", "admin_note": "ok"},
                headers=admin_session["headers"],
            )
        )
        # Get user balance after approval
        u_after_approve = mongo_db.users.find_one({"user_id": uid})
        pts_after_approve = int(u_after_approve.get("points", 0))

        # Ensure credited_points saved
        c = mongo_db.campaign_completions.find_one({"id": compl_id})
        assert int(c.get("credited_points", 0)) == 300

        # DELETE (Reset)
        r = api.delete(
            f"{base_url}/api/admin/campaign-completions/{compl_id}?reason=user%20cheated",
            headers=admin_session["headers"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("deducted") is True

        # Completion is deleted
        assert mongo_db.campaign_completions.find_one({"id": compl_id}) is None

        # Balance deducted by 300
        u_after_reset = mongo_db.users.find_one({"user_id": uid})
        assert int(u_after_reset.get("points", 0)) == pts_after_approve - 300

        # Negative transaction logged
        tx = mongo_db.transactions.find_one(
            {"user_id": uid, "source": "admin", "points": -300}
        )
        assert tx is not None, "Expected a -300 admin/campaign transaction to be logged"
        assert tx.get("category") == "campaign"
        note = tx.get("note", "")
        assert "reset" in note.lower()
        assert "user cheated" in note.lower()

        # cleanup
        mongo_db.campaigns.delete_one({"id": cid})


# ---------- 6) Mobile number set-once ----------
class TestMobileSetOnce:
    def test_set_mobile_then_second_call_blocked(self, api, base_url, mongo_db):
        # Fresh user without mobile
        uid = f"user_TEST_mob_{uuid.uuid4().hex[:8]}"
        tok = f"TEST_tok_{uuid.uuid4().hex[:16]}"
        from datetime import timedelta
        mongo_db.users.insert_one(
            {
                "user_id": uid,
                "email": f"TEST_mob_{uid}@example.com",
                "name": "MobUser",
                "picture": "",
                "points": 0,
                "total_earned": 0,
                "is_admin": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        mongo_db.user_sessions.insert_one(
            {
                "user_id": uid,
                "session_token": tok,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                "created_at": datetime.now(timezone.utc),
            }
        )
        headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

        r1 = api.post(
            f"{base_url}/api/profile/mobile",
            json={"mobile_number": "9123456789", "confirm_mobile_number": "9123456789"},
            headers=headers,
        )
        assert r1.status_code == 200
        assert r1.json().get("mobile_number") == "9123456789"

        # Second call must fail
        r2 = api.post(
            f"{base_url}/api/profile/mobile",
            json={"mobile_number": "9000000000", "confirm_mobile_number": "9000000000"},
            headers=headers,
        )
        assert r2.status_code == 400, r2.text

        # cleanup
        mongo_db.user_sessions.delete_many({"user_id": uid})
        mongo_db.users.delete_one({"user_id": uid})



# ---------- 7) No automatic withdrawal history on campaign approval ----------
class TestNoAutoWithdrawalHistory:
    def test_partial_approval_creates_no_withdrawal_or_ledger_row(
        self, api, base_url, admin_session, user_session, mongo_db
    ):
        uid = user_session["user_id"]

        camp = _wait_ok(
            api.post(
                f"{base_url}/api/admin/campaigns",
                json={
                    "name": f"TEST_NO_AUTO_WD_{int(time.time()*1000)}",
                    "note": "no auto withdrawal history test",
                    "logo_url": "https://x.png",
                    "link_url": "https://x",
                    "reward_points": 1000,
                    "category": "Campaigns",
                    "difficulty": "Easy",
                    "active": True,
                },
                headers=admin_session["headers"],
            )
        )
        cid = camp["id"]
        try:
            r = api.post(
                f"{base_url}/api/tasks/campaign/{cid}/submit",
                json={"form_field_1_value": "user@upi", "form_field_2_value": "Holder Name"},
                headers=user_session["headers"],
            )
            assert r.status_code == 200, r.text
            completion = mongo_db.campaign_completions.find_one({"user_id": uid, "campaign_id": cid})
            assert completion is not None
            before_points = int(mongo_db.users.find_one({"user_id": uid}).get("points", 0))

            _wait_ok(
                api.put(
                    f"{base_url}/api/admin/campaign-completions/{completion['id']}",
                    json={"status": "approved", "admin_note": "", "approved_points": 400},
                    headers=admin_session["headers"],
                )
            )

            history = _wait_ok(api.get(f"{base_url}/api/withdraw/history", headers=user_session["headers"]))
            auto = [w for w in history if w.get("completion_id") == completion["id"]]
            assert len(auto) == 0

            ledger = _wait_ok(
                api.get(f"{base_url}/api/wallet/transactions", headers=user_session["headers"])
            )
            rows = [
                t for t in ledger
                if t.get("source") == "withdraw"
                and t.get("category") == "campaign"
            ]
            assert len(rows) == 0
            after_points = int(mongo_db.users.find_one({"user_id": uid}).get("points", 0))
            assert after_points == before_points + 400
        finally:
            mongo_db.campaigns.delete_one({"id": cid})
