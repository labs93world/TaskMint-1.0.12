from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
import uuid
import random
import httpx
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
# Stable user_id for the canonical admin record. Every successful admin login
# remaps the current session to point at this single record, so the admin
# never accidentally creates a new "Altaf (Admin)" row.
ADMIN_USER_ID = "admin_altaff"

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    points: int = 0
    total_earned: int = 0
    total_withdrawn: int = 0
    total_tasks: int = 0
    streak: int = 0
    last_checkin: Optional[str] = None
    daily_spins_used: int = 0
    daily_scratches_used: int = 0
    last_activity_date: Optional[str] = None
    has_first_withdrawal: bool = False
    is_admin: bool = False
    referral_code: Optional[str] = None
    referred_by: Optional[str] = None
    referral_rewards_paid: List[int] = []
    mobile_number: Optional[str] = None
    admin_session_expires_at: Optional[str] = None
    watch_cycle_started_at: Optional[str] = None
    watch_cycle_used: int = 0
    # Wallet split: per-category balances. Together they should equal `points`.
    campaign_points: int = 0
    games_task_points: int = 0
    # Daily withdraw cap (combined across both wallets).
    withdrawals_today: int = 0
    withdrawals_today_date: Optional[str] = None
    created_at: str

class Banner(BaseModel):
    id: str = Field(default_factory=lambda: f"bnr_{uuid.uuid4().hex[:10]}")
    title: str
    subtitle: Optional[str] = ""
    image_url: str
    link_url: Optional[str] = ""
    active: bool = True
    hidden: bool = False
    pinned: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BannerCreate(BaseModel):
    title: Optional[str] = ""
    subtitle: Optional[str] = ""
    image_url: str
    link_url: Optional[str] = ""
    active: bool = True
    hidden: bool = False
    pinned: bool = False

class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: f"cmp_{uuid.uuid4().hex[:10]}")
    name: str
    note: str
    logo_url: str
    link_url: Optional[str] = ""
    tutorial_video_url: Optional[str] = ""  # YouTube URL shown as embedded tutorial
    rules: Optional[str] = ""  # multi-line rules shown on task detail
    telegram_contact_url: Optional[str] = ""
    cta_label: Optional[str] = ""
    form_field_1_label: Optional[str] = ""  # empty = field hidden
    form_field_1_placeholder: Optional[str] = ""
    form_field_2_label: Optional[str] = ""
    form_field_2_placeholder: Optional[str] = ""
    category: str = "App Install"
    difficulty: str = "Easy"
    reward_points: int
    reward_inr: float
    active: bool = True
    hidden: bool = False
    pinned: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CampaignCreate(BaseModel):
    name: str
    note: str
    logo_url: str
    link_url: Optional[str] = ""
    tutorial_video_url: Optional[str] = ""
    rules: Optional[str] = ""
    telegram_contact_url: Optional[str] = ""
    cta_label: Optional[str] = ""
    form_field_1_label: Optional[str] = ""
    form_field_1_placeholder: Optional[str] = ""
    form_field_2_label: Optional[str] = ""
    form_field_2_placeholder: Optional[str] = ""
    category: str = "App Install"
    difficulty: str = "Easy"
    reward_points: int
    active: bool = True
    hidden: bool = False
    pinned: bool = False

class CampaignCompletion(BaseModel):
    id: str = Field(default_factory=lambda: f"cmc_{uuid.uuid4().hex[:10]}")
    user_id: str
    user_name: str
    user_email: str
    campaign_id: str
    campaign_name: str
    reward_points: int
    form_field_1_value: Optional[str] = ""
    form_field_2_value: Optional[str] = ""
    status: Literal["pending", "approved", "rejected"] = "pending"
    admin_note: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CampaignCompletionUpdate(BaseModel):
    status: Literal["pending", "approved", "rejected"]
    admin_note: Optional[str] = ""
    approved_points: Optional[int] = None  # When approving, override the credited points (0..original).
                                            # If less than original, a successful withdrawal record is also
                                            # created for the ORIGINAL points so the user sees a paid-out
                                            # entry in their withdraw history.

class TaskSubmit(BaseModel):
    form_field_1_value: Optional[str] = ""
    form_field_2_value: Optional[str] = ""

class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: f"txn_{uuid.uuid4().hex[:10]}")
    user_id: str
    type: str  # earn / withdraw
    source: str  # checkin/spin/scratch/campaign/quiz/survey/withdraw
    category: str = "games_task"  # "campaign" | "games_task"
    points: int  # positive for earn, negative for withdraw
    note: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WithdrawRequest(BaseModel):
    id: str = Field(default_factory=lambda: f"wdr_{uuid.uuid4().hex[:10]}")
    user_id: str
    user_name: str
    user_email: str
    method: Literal["upi", "bank"]
    source: Literal["campaign", "games_task"] = "games_task"
    points: int
    inr_amount: float
    upi_id: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_holder: Optional[str] = None
    status: Literal["pending", "successful", "rejected"] = "pending"
    admin_note: Optional[str] = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WithdrawCreate(BaseModel):
    method: Literal["upi", "bank"]
    source: Literal["campaign", "games_task"] = "games_task"
    points: int
    upi_id: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_holder: Optional[str] = None

class WithdrawUpdate(BaseModel):
    status: Literal["pending", "successful", "rejected"]
    admin_note: Optional[str] = ""

class AppLinks(BaseModel):
    telegram: str = ""
    telegram_contact: str = ""
    business_contact: str = ""
    whatsapp: str = ""
    customer_support: str = ""
    privacy_policy: str = ""
    terms: str = ""


class ProfileButton(BaseModel):
    """A single configurable button shown in the Profile → Quick Access list.

    `icon` is a free-form Lucide icon name (e.g. "Send", "Phone", "Globe").
    The frontend dynamically renders the matching Lucide icon, falling back
    to a generic `Link` icon if the name is unknown.
    `url` can be an external URL, an internal app route (e.g. "/refer"),
    or a phone/email URI (e.g. "tel:+91...", "mailto:hello@...").
    """
    id: str = Field(default_factory=lambda: f"pb_{uuid.uuid4().hex[:8]}")
    title: str
    icon: str = "Link"
    url: str = ""
    color: str = "#4F46E5"  # icon tint colour
    sort_order: int = 0
    hidden: bool = False


class ProfileButtonsConfig(BaseModel):
    buttons: List[ProfileButton] = []


class EarnCard(BaseModel):
    """A single configurable card shown on the Earn tab grid.

    `image_url` is a remote PNG/JPG URL (user-uploaded artwork).
    `route` is an internal app route (e.g. "/spin", "/checkin").
    `hero` = True → rendered in the 2-col top hero row.
                False → rendered in the 3-col grid below.
    """
    id: str = Field(default_factory=lambda: f"ec_{uuid.uuid4().hex[:8]}")
    key: str                    # stable identifier (e.g. "spin", "scratch")
    title: str                  # admin-side label only (not rendered on the card)
    image_url: str
    route: str
    hero: bool = False
    sort_order: int = 0
    hidden: bool = False


class EarnCardsConfig(BaseModel):
    cards: List[EarnCard] = []


class AppMetaSettings(BaseModel):
    """Single admin-controlled config doc that powers withdrawal mins, exchange
    ratio, per-task reward ranges, referral mode, and per-screen maintenance.
    Stored in `app_settings._id = 'meta'`.
    """
    # ----- Wallet -----
    exchange_points_per_inr: int = 100         # 100 pts = ₹1 by default
    min_withdrawal_campaign: int = 10000        # points (₹100) [legacy]
    min_withdrawal_games_task: int = 10000      # points (₹100) [legacy]
    min_withdrawal: int = 10000                 # points — single-wallet minimum
    daily_withdrawal_limit: int = 2             # withdrawals per day

    # ----- Task / game reward ranges (min..max points) -----
    spin_min: int = 30;       spin_max: int = 100
    scratch_min: int = 30;    scratch_max: int = 100
    visit_min: int = 30;      visit_max: int = 100
    watch_min: int = 50;      watch_max: int = 100
    survey_min: int = 30;     survey_max: int = 100
    quiz_min: int = 30;       quiz_max: int = 100
    # Higher-or-Lower per-streak tier payouts (matches the game logic).
    hl_reward_streak_3: int = 30
    hl_reward_streak_5: int = 75
    hl_reward_streak_7: int = 100
    memory_completion: int = 200
    ttt_win: int = 100
    math_per_correct: int = 5
    # Tap-the-Coin Rush per-item payouts
    tap_per_diamond: int = 3
    tap_per_gold: int = 2
    tap_per_silver: int = 1
    tap_bomb_penalty: int = 5
    # Trivia Streak
    trivia_per_correct: int = 8
    trivia_streak_bonus: int = 5
    checkin_base: int = 20                       # day 1 reward
    checkin_step: int = 10                       # +N per day after day 1
    checkin_cap: int = 100                       # cap

    # Daily Challenge weighted reward tiers
    daily_challenge_common: int = 50             # ~50% chance
    daily_challenge_uncommon: int = 150          # ~40% chance
    daily_challenge_rare: int = 300              # ~9% chance
    daily_challenge_jackpot: int = 1000          # ~1% chance

    # ----- Referral system -----
    referral_mode: str = "streak"  # "streak" | "withdrawal" | "both"
    # Withdrawal-mode tiers: list of {withdrawals: N, points: X}.
    # e.g. [{"withdrawals":1,"points":1000},{"withdrawals":2,"points":2000},{"withdrawals":3,"points":5000}]
    referral_withdrawal_tiers: List[Dict[str, int]] = []

    # ----- Maintenance / Coming Soon -----
    # Map of route path → {enabled: bool, note: str}.
    # Example: {"/spin": {"enabled": true, "note": "Spin is undergoing improvements"}}
    maintenance: Dict[str, Dict[str, Any]] = {}

    # ----- Home tab (offerwall / campaign) arrangement (admin-editable, item 1) -----
    home_default_tab: str = "offerwall"                       # which sub-tab opens first
    home_tab_order: List[str] = ["offerwall", "campaign"]     # left→right order

    # ----- Per-game ad configuration (admin-editable, item 1b + 6) -----
    # For each game key: ad_type ("interstitial" | "rewarded"), and `every_n`.
    # For chance-based games (hl/ttt/math/memory/tap/trivia): `chances_per_ad`
    # is how many plays one rewarded unlock grants, `every_n` is how often an
    # interstitial appears (in plays). For one-shot claims (checkin/daily/survey)
    # ad_type decides which ad shows on claim.
    game_ad_config: Dict[str, Dict[str, Any]] = {
        "checkin":         {"ad_type": "interstitial", "chances_per_ad": 0,  "every_n": 1},
        "higher_lower":    {"ad_type": "interstitial", "chances_per_ad": 10, "every_n": 2},
        "memory":          {"ad_type": "rewarded",     "chances_per_ad": 1,  "every_n": 0},
        "tictactoe":       {"ad_type": "interstitial", "chances_per_ad": 10, "every_n": 2},
        "math":            {"ad_type": "interstitial", "chances_per_ad": 10, "every_n": 2},
        "daily_challenge": {"ad_type": "rewarded",     "chances_per_ad": 0,  "every_n": 1},
        "tap":             {"ad_type": "interstitial", "chances_per_ad": 5,  "every_n": 1},
        "trivia":          {"ad_type": "interstitial", "chances_per_ad": 5,  "every_n": 1},
        "survey":          {"ad_type": "interstitial", "chances_per_ad": 0,  "every_n": 1},
    }

class WithdrawSettings(BaseModel):
    amounts: List[int] = [100, 10000, 30000, 50000]  # in points (₹1, ₹100, ₹300, ₹500)

class ReferralTier(BaseModel):
    streak_days: int   # at what streak day this bonus pays out
    points: int        # reward points

class ReferralSettings(BaseModel):
    streak_7_reward_points: int = 1000   # ₹10 (kept for back-compat)
    streak_15_reward_points: int = 2000  # ₹20
    tiers: List[ReferralTier] = []       # multi-tier — overrides streak_7/15 when non-empty
    hero_title: str = "Earn ₹10 per friend"
    hero_subtitle: str = "₹10 at 7-day streak • ₹20 at 15-day streak"
    how_it_works_step3: str = "₹10 when they hit a 7-day streak • ₹20 when they hit a 15-day streak"
    sharing_text: str = "🎉 Join me on TaskMint and earn real cash! Use my code {code} when signing up."

class AppVersionInfo(BaseModel):
    latest_version: str = "1.0.1"
    min_supported_version: str = "1.0.0"
    play_store_url: str = "https://play.google.com/store/apps/details?id=com.labs93world.taskmint"
    force_update: bool = False
    release_notes: str = ""

class AdMobSettings(BaseModel):
    android_app_id: str = "ca-app-pub-7744865309171344~1346257321"
    banner_unit_id: str = "ca-app-pub-7744865309171344/7215240687"
    interstitial_unit_id: str = "ca-app-pub-7744865309171344/9409414321"
    rewarded_unit_id: str = "ca-app-pub-7744865309171344/8895153865"
    native_unit_id: str = "ca-app-pub-7744865309171344/5951555040"

class MobileNumberSet(BaseModel):
    mobile_number: str
    confirm_mobile_number: str

class ApplyReferralCode(BaseModel):
    code: str

class AdjustPoints(BaseModel):
    delta: int  # positive to add, negative to deduct
    reason: str
    source: Literal["campaign", "games_task"] = "games_task"

class SessionExchange(BaseModel):
    session_id: str

class DeviceLogin(BaseModel):
    device_id: str
    fingerprint: Optional[str] = None
    device_meta: Optional[dict] = None

class AdminPasswordLogin(BaseModel):
    email: str
    password: str


# ---------- Helpers ----------
# All "day" boundaries (resets, daily limits, streaks, withdrawal caps, etc.)
# use Asia/Kolkata (IST, UTC+5:30). Stored timestamps remain in UTC ISO; only
# the "today" / "yesterday" date strings used for daily reset logic are IST.
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
    IST = ZoneInfo("Asia/Kolkata")
except Exception:  # fallback for environments without zoneinfo
    IST = timezone(timedelta(hours=5, minutes=30))

def today_str() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")

def yesterday_str() -> str:
    return (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

async def get_current_user(request: Request, authorization: Optional[str] = Header(None)) -> dict:
    """Validate session_token from cookie OR Authorization header."""
    token = request.cookies.get("session_token")
    if not token and authorization:
        if authorization.startswith("Bearer "):
            token = authorization[len("Bearer "):]
        else:
            token = authorization
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Apply defaults for any field added in later iterations
    user.setdefault("total_withdrawn", 0)
    user.setdefault("total_earned", 0)
    user.setdefault("total_tasks", 0)
    user.setdefault("streak", 0)
    user.setdefault("daily_spins_used", 0)
    user.setdefault("daily_scratches_used", 0)
    user.setdefault("has_first_withdrawal", False)
    user.setdefault("is_admin", False)
    user.setdefault("pending_spin_reward", 0)
    user.setdefault("pending_scratch_reward", 0)
    user.setdefault("daily_visits_used", 0)
    user.setdefault("daily_surveys_used", 0)
    user.setdefault("daily_quizzes_used", 0)
    user.setdefault("referral_code", None)
    user.setdefault("referred_by", None)
    user.setdefault("referral_rewards_paid", [])
    user.setdefault("mobile_number", None)
    # Per-user overrides (admin can set for a specific user; None => use global)
    user.setdefault("custom_exchange_ratio", None)
    user.setdefault("custom_withdraw_amounts", None)
    # Wallet split defaults (legacy users predating iter-21)
    user.setdefault("campaign_points", 0)
    user.setdefault("games_task_points", 0)
    user.setdefault("withdrawals_today", 0)
    user.setdefault("withdrawals_today_date", None)
    # Auto-expire admin privileges after 6 hours
    if user.get("is_admin") and user.get("admin_session_expires_at"):
        try:
            exp = datetime.fromisoformat(user["admin_session_expires_at"])
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                await db.users.update_one(
                    {"user_id": user["user_id"]},
                    {"$set": {"is_admin": False, "admin_session_expires_at": None}},
                )
                user["is_admin"] = False
                user["admin_session_expires_at"] = None
                # Restore the original device-user for this session, if we have it
                fallback_id = session.get("device_user_id")
                if fallback_id and fallback_id != user["user_id"]:
                    await db.user_sessions.update_one(
                        {"session_token": token},
                        {"$set": {"user_id": fallback_id}, "$unset": {"device_user_id": ""}},
                    )
                    restored = await db.users.find_one({"user_id": fallback_id}, {"_id": 0})
                    if restored:
                        user = restored
        except Exception:
            pass
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user

async def reset_daily_limits_if_needed(user: dict) -> dict:
    today = today_str()
    if user.get("last_activity_date") != today:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "daily_spins_used": 0,
                "daily_scratches_used": 0,
                "daily_watches_used": 0,
                "daily_visits_used": 0,
                "daily_surveys_used": 0,
                "daily_quizzes_used": 0,
                "memory_plays_used": 0,
                "ttt_plays_used": 0,
                "math_plays_used": 0,
                "last_activity_date": today,
            }},
        )
        user["daily_spins_used"] = 0
        user["daily_scratches_used"] = 0
        user["daily_watches_used"] = 0
        user["daily_visits_used"] = 0
        user["daily_surveys_used"] = 0
        user["daily_quizzes_used"] = 0
        user["memory_plays_used"] = 0
        user["ttt_plays_used"] = 0
        user["math_plays_used"] = 0
        user["last_activity_date"] = today
    return user

async def add_points_and_log(user_id: str, points: int, source: str, note: str = "", category: str = "games_task"):
    """Atomically add points to the correct wallet bucket and create a transaction.

    `category` is "campaign" or "games_task". The legacy `points` field stays in
    sync (sum of both buckets) for backward compatibility with the rest of the
    code that still reads `user.points`.
    """
    if category not in ("campaign", "games_task"):
        category = "games_task"
    bucket_field = "campaign_points" if category == "campaign" else "games_task_points"
    update = {"$inc": {"points": points, bucket_field: points, "total_tasks": 1 if points > 0 else 0}}
    if points > 0:
        update["$inc"]["total_earned"] = points
    await db.users.update_one({"user_id": user_id}, update)
    txn = Transaction(
        user_id=user_id, type="earn" if points > 0 else "withdraw",
        source=source, category=category, points=points, note=note,
    )
    await db.transactions.insert_one(txn.dict())


async def make_referral_code(name: str) -> str:
    """Generate a uppercase alphanumeric referral code derived from the user's name.
    Keeps only [A-Z0-9], min length 4. On collision append a 3-hex suffix."""
    base = "".join(ch for ch in (name or "").upper() if ch.isalnum())
    if len(base) < 4:
        base = (base + "USER")[:4]
    base = base[:16]
    code = base
    # Ensure uniqueness
    for _ in range(10):
        if not await db.users.find_one({"referral_code": code}, {"_id": 0, "user_id": 1}):
            return code
        code = f"{base}{uuid.uuid4().hex[:3].upper()}"
    # extremely unlikely fallback
    return f"{base}{uuid.uuid4().hex[:6].upper()}"


async def get_referral_settings() -> dict:
    doc = await db.referral_settings.find_one({"_id": "singleton"}, {"_id": 0})
    return doc or ReferralSettings().dict()


async def get_app_meta() -> dict:
    """Return the singleton admin-controlled config (`app_settings._id='meta'`),
    falling back to AppMetaSettings() defaults for any missing field."""
    doc = await db.app_settings.find_one({"_id": "meta"}, {"_id": 0}) or {}
    defaults = AppMetaSettings().dict()
    # merge defaults under doc so any newly added field still has a value
    merged = {**defaults, **doc}
    return merged

async def reward_range(field_min: str, field_max: str) -> int:
    """Sample a random reward between admin-configured min and max."""
    meta = await get_app_meta()
    lo = int(meta.get(field_min, 0) or 0)
    hi = int(meta.get(field_max, lo) or lo)
    if hi < lo:
        hi = lo
    if hi <= 0:
        return 0
    return random.randint(lo, hi)


# ---------- Auth ----------
@api_router.post("/auth/session")
async def auth_session(payload: SessionExchange, response: Response):
    """Exchange session_id (from Emergent OAuth) for our session_token."""
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data["email"]
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data["session_token"]

    # Find or create user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user = existing
        # ensure picture/name updates
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"name": name, "picture": picture, "is_admin": email == ADMIN_EMAIL}},
        )
        user["name"] = name
        user["picture"] = picture
        user["is_admin"] = email == ADMIN_EMAIL
    else:
        new_user_id = f"user_{uuid.uuid4().hex[:12]}"
        ref_code = await make_referral_code(name)
        new_user = User(
            user_id=new_user_id,
            email=email, name=name, picture=picture,
            is_admin=(email == ADMIN_EMAIL),
            referral_code=ref_code,
            created_at=now_iso(),
        )
        await db.users.insert_one(new_user.dict())
        user = new_user.dict()

    # Save session
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "user_id": user["user_id"],
            "session_token": session_token,
            "expires_at": expires,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 3600,
    )

    user_clean = {k: v for k, v in user.items() if k != "_id"}
    return {"user": user_clean, "session_token": session_token}

@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    # Reset all daily counters at IST midnight (spins, scratches, watches, visits,
    # surveys, quizzes, memory/ttt/math game plays). Also updates last_activity_date
    # for DAU stats.
    user = await reset_daily_limits_if_needed(user)
    return user


@api_router.post("/auth/device")
async def auth_device(payload: DeviceLogin, response: Response):
    """One-tap login using the device ID. Creates an anonymous user if new.

    Anti-clone defence: cloning apps (Parallel Space, Dual Apps, work-profile,
    etc.) give the app a fresh ANDROID_ID (it is scoped per Android user-id
    + signing key). They cannot, however, lie about the underlying hardware
    fingerprint (brand + manufacturer + modelName + designName + osBuildId).
    We therefore:
      1. Try exact device_id match → return that account.
      2. Try fingerprint match → quietly attach the new device_id to the
         existing account and return it (one-device-one-account guarantee).
      3. Otherwise create a brand-new account and store its fingerprint.
    """
    device_id = payload.device_id.strip()
    if not device_id or len(device_id) < 6:
        raise HTTPException(status_code=400, detail="Invalid device ID")

    fingerprint = (payload.fingerprint or "").strip() or None

    # 1. Exact device_id match (returning user / re-install on same ROM).
    existing = await db.users.find_one(
        {"$or": [{"device_id": device_id}, {"device_ids": device_id}]},
        {"_id": 0},
    )

    # 2. Fingerprint match → same physical device, just cloned/parallel-spaced.
    if not existing and fingerprint:
        existing = await db.users.find_one({"device_fingerprint": fingerprint}, {"_id": 0})
        if existing:
            await db.users.update_one(
                {"user_id": existing["user_id"]},
                {"$addToSet": {"device_ids": device_id}},
            )

    if existing:
        user = existing
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        name = f"User{device_id[-4:].upper()}"
        ref_code = await make_referral_code(name)
        new_user = User(
            user_id=user_id,
            email=f"{device_id[:10]}@device.local",
            name=name,
            picture=None,
            is_admin=False,
            referral_code=ref_code,
            created_at=now_iso(),
        ).dict()
        new_user["device_id"] = device_id
        new_user["device_ids"] = [device_id]
        if fingerprint:
            new_user["device_fingerprint"] = fingerprint
        if payload.device_meta:
            new_user["device_meta"] = payload.device_meta
        await db.users.insert_one(new_user)
        user = new_user

    session_token = f"dev_{uuid.uuid4().hex}"
    expires = datetime.now(timezone.utc) + timedelta(days=365 * 5)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires,
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        path="/", max_age=365 * 5 * 24 * 3600,
    )
    user_clean = {k: v for k, v in user.items() if k != "_id"}
    return {"user": user_clean, "session_token": session_token}


@api_router.post("/auth/admin-login")
async def auth_admin_login(payload: AdminPasswordLogin, request: Request, response: Response):
    """Promote the current device session to the admin role.

    We never mutate the calling device-user row. Instead we keep a single
    canonical admin record (`user_id == ADMIN_USER_ID`) and remap the current
    session to point at it. The original device user_id is remembered in the
    session as `device_user_id` so admin-logout (or 6-hour expiry) can
    seamlessly restore the original user with their points/streak intact.
    """
    if payload.email.strip().lower() != ADMIN_EMAIL or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = request.cookies.get("session_token")
    auth_header = request.headers.get("authorization", "")
    if not token and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated. Login first.")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    # Ensure the canonical admin record exists exactly once.
    admin_user = await db.users.find_one({"user_id": ADMIN_USER_ID}, {"_id": 0})
    if not admin_user:
        admin_user = User(
            user_id=ADMIN_USER_ID,
            email=ADMIN_EMAIL,
            name="Altaf (Admin)",
            picture=None,
            is_admin=True,
            referral_code="ALTAF",
            created_at=now_iso(),
        ).dict()
        await db.users.insert_one(admin_user)

    # Promote + extend admin window on the canonical admin record.
    await db.users.update_one(
        {"user_id": ADMIN_USER_ID},
        {"$set": {
            "is_admin": True,
            "email": ADMIN_EMAIL,
            "name": "Altaf (Admin)",
            "referral_code": "ALTAF",
            "admin_session_expires_at": (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
        }},
    )
    # Free up ALTAF code if any other user holds it (legacy data).
    await db.users.update_many(
        {"referral_code": "ALTAF", "user_id": {"$ne": ADMIN_USER_ID}},
        {"$set": {"referral_code": None}},
    )

    # Remap the current session to the canonical admin (only set
    # device_user_id once, so repeat logins don't overwrite it with the admin id).
    device_uid = session.get("device_user_id") or session["user_id"]
    if device_uid == ADMIN_USER_ID:
        # Calling session is already the admin record (someone logged in twice
        # without an intermediate device session) — leave device_user_id unset.
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {"user_id": ADMIN_USER_ID}},
        )
    else:
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {"user_id": ADMIN_USER_ID, "device_user_id": device_uid}},
        )

    user = await db.users.find_one({"user_id": ADMIN_USER_ID}, {"_id": 0})
    user.setdefault("total_withdrawn", 0)
    user.setdefault("total_earned", 0)
    user.setdefault("total_tasks", 0)
    user.setdefault("streak", 0)
    return {"ok": True, "user": user}


@api_router.post("/auth/admin-logout")
async def auth_admin_logout(request: Request, user: dict = Depends(get_current_user)):
    """Demote admin and restore the original device user on this session."""
    token = request.cookies.get("session_token")
    auth_header = request.headers.get("authorization", "")
    if not token and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0}) if token else None

    # Demote the admin record (keep all its data — points, streak, refs).
    await db.users.update_one(
        {"user_id": ADMIN_USER_ID},
        {"$set": {"is_admin": False, "admin_session_expires_at": None}},
    )

    # Restore the session to the original device user, if we have one stored.
    fallback_id = (session or {}).get("device_user_id")
    if token and fallback_id and fallback_id != ADMIN_USER_ID:
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {"user_id": fallback_id}, "$unset": {"device_user_id": ""}},
        )
        fresh = await db.users.find_one({"user_id": fallback_id}, {"_id": 0})
    else:
        fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": fresh}

@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Public content ----------
@api_router.get("/banners")
async def get_banners():
    items = await db.banners.find(
        {"active": True, "$or": [{"hidden": {"$ne": True}}, {"hidden": {"$exists": False}}]},
        {"_id": 0},
    ).sort([("pinned", -1), ("created_at", -1)]).to_list(100)
    return items

@api_router.get("/campaigns")
async def get_campaigns():
    items = await db.campaigns.find(
        {"active": True, "$or": [{"hidden": {"$ne": True}}, {"hidden": {"$exists": False}}]},
        {"_id": 0},
    ).sort([("pinned", -1), ("created_at", -1)]).to_list(100)
    # Recompute reward_inr live from the admin-controlled exchange ratio so the
    # offerwall/campaign INR always reflects the current App Config value.
    meta = await get_app_meta()
    ratio = int(meta.get("exchange_points_per_inr", 100) or 100) or 100
    for it in items:
        it["reward_inr"] = round(int(it.get("reward_points", 0) or 0) / float(ratio), 2)
    return items

@api_router.get("/links")
async def get_links():
    doc = await db.app_links.find_one({"_id": "singleton"}, {"_id": 0})
    return doc or AppLinks().dict()


# ---------- Profile Quick Access buttons (admin-configurable) ----------
async def _resolve_default_urls() -> Dict[str, str]:
    """Pull URLs from app_links so the default Quick Access buttons stay
    functional on a fresh install where the admin hasn't customised buttons."""
    doc = await db.app_links.find_one({"_id": "singleton"}, {"_id": 0})
    links = doc or {}
    return {
        "Telegram Channel": links.get("telegram", ""),
        "Contact on Telegram": links.get("telegram_contact", ""),
        "Contact for Business": links.get("business_contact", ""),
        "Privacy Policy": links.get("privacy_policy", ""),
        "Terms & Conditions": links.get("terms", ""),
    }


def _default_profile_buttons() -> List[Dict[str, Any]]:
    """Sensible defaults shown on a fresh install (mirror the previous
    hardcoded list in profile.tsx). Admin can fully replace these."""
    return [
        {"id": "pb_default_1", "title": "Telegram Channel", "icon": "Send",
         "url": "", "color": "#0088cc", "sort_order": 1, "hidden": False},
        {"id": "pb_default_2", "title": "Contact on Telegram", "icon": "MessageCircle",
         "url": "", "color": "#0088cc", "sort_order": 2, "hidden": False},
        {"id": "pb_default_3", "title": "Contact for Business", "icon": "Briefcase",
         "url": "", "color": "#4F46E5", "sort_order": 3, "hidden": False},
        {"id": "pb_default_4", "title": "Privacy Policy", "icon": "ShieldCheck",
         "url": "", "color": "#4F46E5", "sort_order": 4, "hidden": False},
        {"id": "pb_default_5", "title": "Terms & Conditions", "icon": "FileText",
         "url": "", "color": "#4F46E5", "sort_order": 5, "hidden": False},
    ]


@api_router.get("/profile-buttons")
async def get_profile_buttons():
    """Public read — used by the Profile tab. Returns ordered, non-hidden buttons.
    If admin hasn't configured any yet, returns sensible defaults so the UI
    never looks empty.
    """
    doc = await db.profile_buttons.find_one({"_id": "singleton"}, {"_id": 0})
    items: List[Dict[str, Any]] = (doc or {}).get("buttons", []) or []
    used_defaults = False
    if not items:
        items = _default_profile_buttons()
        used_defaults = True
    # When using defaults, hydrate URLs from app_links so links still work
    # for admins who haven't customised yet.
    if used_defaults:
        url_map = await _resolve_default_urls()
        for b in items:
            if not b.get("url"):
                b["url"] = url_map.get(b.get("title", ""), "")
    items = [b for b in items if not b.get("hidden")]
    items.sort(key=lambda b: int(b.get("sort_order", 0) or 0))
    return {"buttons": items}


@api_router.get("/withdraw-settings")
async def get_withdraw_settings():
    doc = await db.withdraw_settings.find_one({"_id": "singleton"}, {"_id": 0})
    base = doc or WithdrawSettings().dict()
    # Merge in admin-controlled mins / exchange ratio so client can render thresholds.
    meta = await get_app_meta()
    base["exchange_points_per_inr"] = int(meta.get("exchange_points_per_inr", 100) or 100)
    base["min_withdrawal_campaign"] = int(meta.get("min_withdrawal_campaign", 10000) or 10000)
    base["min_withdrawal_games_task"] = int(meta.get("min_withdrawal_games_task", 10000) or 10000)
    base["min_withdrawal"] = int(meta.get("min_withdrawal", 10000) or 10000)
    base["daily_withdrawal_limit"] = int(meta.get("daily_withdrawal_limit", 2) or 2)
    return base


# ---------- Earn cards (admin-orderable, hide/show, hero flag) ----------
_EARN_HOST = "https://customer-assets.emergentagent.com/job_task-importer/artifacts"

def _default_earn_cards() -> List[Dict[str, Any]]:
    """Built-in seed of the 15 premium card artworks shipped with the app.
    Admin can reorder them, hide some, or toggle which two appear as the
    hero (top 2-column) row.
    """
    raw = [
        # hero row
        ("checkin", "Daily Check-in",  "x6hdp4u9_Daily%20Check-in.png",     "/checkin",         True),
        ("refer",   "Refer & Earn",    "vw3e26bj_Refer%20%26%20Earn.png",   "/refer",           True),
        # grid order (matches the order the user requested)
        ("hl",      "Higher or Lower", "etpdwkkd_higher%20Lower.png",        "/higher-lower",    False),
        ("memory",  "Memory Match",    "xi30kh1e_memory%20Match.png",        "/memory-match",    False),
        ("ttt",     "Tic-Tac-Toe",     "xw0uyd0n_Tic%20Tac%20Toe.png",       "/tic-tac-toe",     False),
        ("math",    "Math Sprint",     "uplo3z6d_Match%20Sprint.png",        "/math-sprint",     False),
        ("daily",   "Daily Challenge", "dlv7fgvt_Daily%20Challenge.png",     "/daily-challenge", False),
        ("tap",     "Tap the Coins",   "ltvcekrs_Tap%20The%20Coins.png",     "/tap-rush",        False),
        ("trivia",  "Trivia Streak",   "1egvrie3_Trivia%20Streak.png",       "/trivia-streak",   False),
        ("spin",    "Spin & Win",      "n8x5w80e_Spin%20%26%20Win.png",      "/spin",            False),
        ("scratch", "Scratch & Earn",  "kkh28geq_Scratch%20%26%20Earn.png",  "/scratch",         False),
        ("watch",   "Watch & Earn",    "plghot37_Watch%20%26%20Earn.png",    "/watch-earn",      False),
        ("visit",   "Visit & Earn",    "wx3xbupj_Visit%20%26%20Earn.png",    "/visit-earn",      False),
        ("surveys", "Surveys",         "gg1c12jm_Surveys.png",               "/surveys",         False),
        ("quizzes", "Quizzes",         "2jx1gvcy_Quizzes.png",               "/quizzes",         False),
    ]
    out: List[Dict[str, Any]] = []
    for idx, (key, title, fname, route, hero) in enumerate(raw, start=1):
        out.append({
            "id": f"ec_default_{key}",
            "key": key,
            "title": title,
            "image_url": f"{_EARN_HOST}/{fname}",
            "route": route,
            "hero": hero,
            "sort_order": idx,
            "hidden": False,
        })
    return out


@api_router.get("/earn-cards")
async def get_earn_cards():
    """Public read — used by the Earn tab. Returns visible cards ordered by sort_order.
    If admin hasn't configured any yet, returns sensible defaults so the UI
    never looks empty.
    """
    doc = await db.earn_cards.find_one({"_id": "singleton"}, {"_id": 0})
    items: List[Dict[str, Any]] = (doc or {}).get("cards", []) or []
    if not items:
        items = _default_earn_cards()
    items = [c for c in items if not c.get("hidden")]
    items.sort(key=lambda c: int(c.get("sort_order", 0) or 0))
    return {"cards": items}


@api_router.get("/app-config")
async def get_public_app_config():
    """Public read-only subset of the admin meta config — used by client to
    render reward ranges, withdraw mins, exchange ratio, and maintenance state."""
    return await get_app_meta()

@api_router.get("/maintenance")
async def get_maintenance():
    """Just the maintenance map, polled by every screen on focus."""
    meta = await get_app_meta()
    return {"maintenance": meta.get("maintenance", {})}

@api_router.get("/campaign-completions")
async def my_campaign_completions(user: dict = Depends(get_current_user)):
    items = await db.campaign_completions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    return items


# ---------- Referrals ----------
@api_router.get("/referrals/me")
async def my_referrals(user: dict = Depends(get_current_user)):
    """Return this user's referral code, referrer, and tracked stats."""
    # Make sure user has a code (backfill for legacy accounts)
    code = user.get("referral_code")
    if not code:
        code = await make_referral_code(user.get("name") or "USER")
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
    referred_by = user.get("referred_by")
    referrer_name = None
    referrer_code = None
    if referred_by:
        ref_user = await db.users.find_one({"user_id": referred_by}, {"_id": 0, "name": 1, "referral_code": 1})
        if ref_user:
            referrer_name = ref_user.get("name")
            referrer_code = ref_user.get("referral_code")

    count = await db.users.count_documents({"referred_by": user["user_id"]})
    earn_cursor = db.transactions.aggregate([
        {"$match": {"user_id": user["user_id"], "source": "referral", "points": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$points"}}},
    ])
    total_earned = 0
    async for row in earn_cursor:
        total_earned = int(row.get("total", 0))

    can_apply = (referred_by is None) and (user.get("last_checkin") in (None, ""))
    settings = await get_referral_settings()
    return {
        "referral_code": code,
        "referred_by": referred_by,
        "referrer_name": referrer_name,
        "referrer_code": referrer_code,
        "count": count,
        "total_earned_points": total_earned,
        "total_earned_inr": round(total_earned / 100, 2),
        "can_apply": can_apply,
        "hero_title": settings.get("hero_title", "Earn ₹10 per friend"),
        "hero_subtitle": settings.get("hero_subtitle", "₹10 at 7-day streak • ₹20 at 15-day streak"),
        "how_it_works_step3": settings.get(
            "how_it_works_step3",
            "₹10 when they hit a 7-day streak • ₹20 when they hit a 15-day streak",
        ),
        "sharing_text": settings.get(
            "sharing_text",
            "🎉 Join me on TaskMint and earn real cash! Use my code {code} when signing up.",
        ),
        "tiers": settings.get("tiers") or [],
    }


@api_router.post("/referrals/apply")
async def apply_referral_code(payload: ApplyReferralCode, user: dict = Depends(get_current_user)):
    """Attach a referrer to the current user — only before the first check-in."""
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Enter a referral code")
    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="You've already applied a referral code")
    if user.get("last_checkin"):
        raise HTTPException(
            status_code=400,
            detail="You can no longer apply a code — you've already completed a daily check-in",
        )
    # Cannot use your own code
    if code == (user.get("referral_code") or "").upper():
        raise HTTPException(status_code=400, detail="You can't use your own code")

    referrer = await db.users.find_one({"referral_code": code}, {"_id": 0})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"referred_by": referrer["user_id"]}},
    )
    return {
        "ok": True,
        "referrer_name": referrer.get("name"),
        "referrer_code": referrer.get("referral_code"),
    }


# ---------- Tasks ----------
@api_router.post("/tasks/checkin")
async def daily_checkin(user: dict = Depends(get_current_user)):
    user = await reset_daily_limits_if_needed(user)
    today = today_str()
    if user.get("last_checkin") == today:
        raise HTTPException(status_code=400, detail="Already checked in today")
    yesterday = yesterday_str()
    new_streak = user.get("streak", 0) + 1 if user.get("last_checkin") == yesterday else 1
    # Admin-configurable reward curve: base + step*(streak-1), capped.
    meta_chk = await get_app_meta()
    base = int(meta_chk.get("checkin_base", 20) or 20)
    step = int(meta_chk.get("checkin_step", 10) or 10)
    cap = int(meta_chk.get("checkin_cap", 100) or 100)
    reward = min(base + (new_streak - 1) * step, cap)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_checkin": today, "streak": new_streak}},
    )
    await add_points_and_log(user["user_id"], reward, "checkin", f"Day {new_streak} streak")

    # ---------- Referral milestone payout ----------
    referrer_id = user.get("referred_by")
    paid = user.get("referral_rewards_paid", []) or []
    if referrer_id:
        # Respect admin's chosen referral mode. Streak payouts only fire when
        # mode is "streak" or "both"; "withdrawal" mode pays exclusively on
        # successful withdrawals (handled in the withdrawal-approval endpoint).
        meta_ref = await get_app_meta()
        ref_mode = (meta_ref.get("referral_mode") or "streak").lower()
        if ref_mode in ("streak", "both"):
            settings = await get_referral_settings()
            # Multi-tier: if admin configured custom tiers, use them.
            tiers = settings.get("tiers") or []
            if tiers:
                for tier in tiers:
                    streak_days = int(tier.get("streak_days", 0) or 0)
                    pts = int(tier.get("points", 0) or 0)
                    if streak_days > 0 and new_streak == streak_days and streak_days not in paid and pts > 0:
                        await add_points_and_log(
                            referrer_id, pts, "referral",
                            f"Referral bonus — {user.get('name', 'friend')} hit {streak_days}-day streak",
                        )
                        await db.users.update_one(
                            {"user_id": user["user_id"]},
                            {"$push": {"referral_rewards_paid": streak_days}},
                        )
            else:
                # Legacy 7/15-day rewards
                if new_streak in (7, 15) and new_streak not in paid:
                    reward_amt = (
                        settings.get("streak_7_reward_points", 1000) if new_streak == 7
                        else settings.get("streak_15_reward_points", 2000)
                    )
                    if reward_amt > 0:
                        await add_points_and_log(
                            referrer_id, reward_amt, "referral",
                            f"Referral bonus — {user.get('name', 'friend')} hit {new_streak}-day streak",
                        )
                    await db.users.update_one(
                        {"user_id": user["user_id"]},
                        {"$push": {"referral_rewards_paid": new_streak}},
                    )
    return {"reward": reward, "streak": new_streak}

@api_router.post("/tasks/spin")
async def spin_wheel(user: dict = Depends(get_current_user)):
    user = await reset_daily_limits_if_needed(user)
    if user.get("daily_spins_used", 0) >= 5:
        raise HTTPException(status_code=400, detail="Daily spin limit reached")
    if user.get("pending_spin_reward", 0) > 0:
        raise HTTPException(status_code=400, detail="Claim previous spin first")
    reward = await reward_range("spin_min", "spin_max")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"daily_spins_used": 1}, "$set": {"pending_spin_reward": reward}},
    )
    return {"reward": reward, "remaining": 4 - user.get("daily_spins_used", 0)}

@api_router.post("/tasks/spin/claim")
async def spin_claim(user: dict = Depends(get_current_user)):
    pending = user.get("pending_spin_reward", 0)
    if pending <= 0:
        raise HTTPException(status_code=400, detail="No pending spin reward to claim")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"pending_spin_reward": 0}}
    )
    await add_points_and_log(user["user_id"], pending, "spin", "Spin reward claimed")
    return {"reward": pending}

@api_router.post("/tasks/scratch")
async def scratch_card(user: dict = Depends(get_current_user)):
    user = await reset_daily_limits_if_needed(user)
    if user.get("daily_scratches_used", 0) >= 5:
        raise HTTPException(status_code=400, detail="Daily scratch limit reached")
    if user.get("pending_scratch_reward", 0) > 0:
        raise HTTPException(status_code=400, detail="Claim previous scratch first")
    reward = await reward_range("scratch_min", "scratch_max")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"daily_scratches_used": 1}, "$set": {"pending_scratch_reward": reward}},
    )
    return {"reward": reward, "remaining": 4 - user.get("daily_scratches_used", 0)}

@api_router.post("/tasks/scratch/claim")
async def scratch_claim(user: dict = Depends(get_current_user)):
    pending = user.get("pending_scratch_reward", 0)
    if pending <= 0:
        raise HTTPException(status_code=400, detail="No pending scratch reward to claim")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"pending_scratch_reward": 0}}
    )
    await add_points_and_log(user["user_id"], pending, "scratch", "Scratch reward claimed")
    return {"reward": pending}

@api_router.post("/tasks/watch")
async def watch_video(user: dict = Depends(get_current_user)):
    """Watch & Earn — 5 watches per 6-hour cycle. Reward 50-100.

    Each user has a sliding 6-hour `watch_cycle_started_at`. When the user
    burns through 5 watches, they must wait the rest of the 6 hours before
    a new cycle starts. The frontend uses `watch_cycle_started_at` to show
    a countdown timer (cycle resets at `started_at + 6h`).
    """
    now = datetime.now(timezone.utc)
    started_iso = user.get("watch_cycle_started_at")
    started_at = None
    if started_iso:
        try:
            started_at = datetime.fromisoformat(started_iso)
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
        except Exception:
            started_at = None

    cycle_used = int(user.get("watch_cycle_used", 0) or 0)

    # If no cycle yet, or last cycle older than 6 hours → start a fresh cycle.
    if not started_at or (now - started_at) >= timedelta(hours=6):
        started_at = now
        cycle_used = 0

    settings = await get_game_settings()
    cycle_limit = int(settings["watch_cycle_limit"])
    cycle_hours = int(settings["watch_cycle_hours"])
    # Reward range — admin meta config takes priority over legacy game_settings.
    meta_for_watch = await get_app_meta()
    r_min = int(meta_for_watch.get("watch_min", settings["watch_reward_min"]) or 50)
    r_max = int(meta_for_watch.get("watch_max", settings["watch_reward_max"]) or 100)
    if r_max < r_min:
        r_max = r_min

    if cycle_used >= cycle_limit:
        resets_at = (started_at + timedelta(hours=cycle_hours)).isoformat()
        raise HTTPException(
            status_code=400,
            detail={"code": "watch_cooldown", "resets_at": resets_at},
        )

    reward = random.randint(r_min, r_max)
    new_used = cycle_used + 1
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "watch_cycle_started_at": started_at.isoformat(),
            "watch_cycle_used": new_used,
        }},
    )
    await add_points_and_log(user["user_id"], reward, "watch", "Watch & Earn")
    resets_at = (started_at + timedelta(hours=cycle_hours)).isoformat()
    return {
        "reward": reward,
        "remaining": cycle_limit - new_used,
        "cycle_resets_at": resets_at,
        "cycle_used": new_used,
    }


class VisitCompleteBody(BaseModel):
    site_id: str


@api_router.post("/tasks/visit")
async def visit_site(payload: VisitCompleteBody, user: dict = Depends(get_current_user)):
    """Visit & Earn — credits 50-100 points. Each site can be completed only once per day,
    but there's no global daily limit — user can complete every active site."""
    # Confirm the site exists & is active
    site = await db.visit_sites.find_one({"id": payload.site_id, "active": True}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found or inactive")

    today = today_str()
    # Prevent duplicate claim for the same site today
    existing = await db.visit_completions.find_one(
        {"user_id": user["user_id"], "site_id": payload.site_id, "date": today}
    )
    if existing:
        raise HTTPException(status_code=400, detail="This site is already completed today")

    reward = await reward_range("visit_min", "visit_max")
    await db.visit_completions.insert_one({
        "user_id": user["user_id"],
        "site_id": payload.site_id,
        "date": today,
        "reward": reward,
        "created_at": datetime.now(timezone.utc),
    })
    await add_points_and_log(user["user_id"], reward, "visit", f"Visit: {site['title']}")
    return {"reward": reward}


@api_router.get("/tasks/visit/completed-today")
async def visit_completed_today(user: dict = Depends(get_current_user)):
    """Return site IDs the current user has already claimed today."""
    today = today_str()
    rows = await db.visit_completions.find(
        {"user_id": user["user_id"], "date": today}, {"_id": 0, "site_id": 1}
    ).to_list(500)
    return {"site_ids": [r["site_id"] for r in rows]}


# ---------- Surveys & Quizzes pools ----------
# Shared generic question bank — every survey reuses 5 random questions from here.
# Each entry: { "q": str, "options": [str, ...] }. Answers are subjective so there's
# no notion of "correct"; we just want the user to thoughtfully tap through.
SURVEY_QUESTION_BANK = [
    {"q": "How often do you engage with this?", "options": ["Daily", "Weekly", "Monthly", "Rarely", "Never"]},
    {"q": "How satisfied are you overall?", "options": ["Very satisfied", "Satisfied", "Neutral", "Unsatisfied", "Very unsatisfied"]},
    {"q": "How likely are you to recommend it to a friend?", "options": ["Definitely", "Probably", "Maybe", "Probably not", "Definitely not"]},
    {"q": "Which factor matters most to you?", "options": ["Price", "Quality", "Convenience", "Brand", "Reviews"]},
    {"q": "Would you pay more for a premium version?", "options": ["Yes", "Maybe", "No"]},
    {"q": "What's your age group?", "options": ["Under 18", "18-24", "25-34", "35-44", "45+"]},
    {"q": "Which device do you use most often for this?", "options": ["Smartphone", "Tablet", "Laptop", "Desktop", "Smart TV"]},
    {"q": "How did you first discover it?", "options": ["Friend / family", "Social media", "Online ad", "App store", "Search engine"]},
    {"q": "How would you rate the experience?", "options": ["Excellent", "Good", "Average", "Below average", "Poor"]},
    {"q": "What time of day do you usually engage?", "options": ["Morning", "Afternoon", "Evening", "Night", "Anytime"]},
    {"q": "How much do you spend on this monthly?", "options": ["Less than ₹500", "₹500-2000", "₹2000-5000", "₹5000-10000", "More than ₹10000"]},
    {"q": "What city size do you live in?", "options": ["Metro", "Tier-1 city", "Tier-2 city", "Tier-3 city", "Town / village"]},
    {"q": "How long have you been using it?", "options": ["Less than a month", "1-6 months", "6-12 months", "1-3 years", "More than 3 years"]},
    {"q": "Do you compare options before buying?", "options": ["Always", "Most of the time", "Sometimes", "Rarely", "Never"]},
    {"q": "Which channel do you trust most for reviews?", "options": ["YouTube", "Blogs / articles", "Friends & family", "Influencers", "App-store ratings"]},
    {"q": "How easy was it to get started?", "options": ["Very easy", "Easy", "Neutral", "Difficult", "Very difficult"]},
    {"q": "Pick the feature you value most:", "options": ["Speed", "Design", "Reliability", "Support", "Pricing"]},
    {"q": "Which payment method do you prefer?", "options": ["UPI", "Debit card", "Credit card", "Cash on delivery", "Wallet"]},
    {"q": "Do you receive offers about this from brands?", "options": ["Daily", "Weekly", "Monthly", "Rarely", "Never"]},
    {"q": "What's your gender?", "options": ["Male", "Female", "Non-binary", "Prefer not to say"]},
    {"q": "How important is sustainability to you here?", "options": ["Very important", "Important", "Somewhat", "Not really", "Not at all"]},
    {"q": "How often do you switch providers / brands?", "options": ["Frequently", "Sometimes", "Rarely", "Once a year", "Never"]},
    {"q": "Have you ever complained to customer support?", "options": ["Multiple times", "Once", "Considered it", "Never needed to"]},
    {"q": "Would you recommend this in 2026?", "options": ["Definitely yes", "Probably yes", "Not sure", "Probably no", "Definitely no"]},
    {"q": "Which language do you prefer for content here?", "options": ["English", "Hindi", "Tamil", "Bengali", "Other regional"]},
]

SURVEY_POOL = [
    {"title": "How often do you shop on Amazon/Flipkart?", "time": "2 min"},
    {"title": "Which OTT platform do you use most?", "time": "1 min"},
    {"title": "Your favourite food delivery app (Swiggy/Zomato)?", "time": "2 min"},
    {"title": "Mobile recharge habits — prepaid or postpaid?", "time": "1 min"},
    {"title": "Quick poll: best UPI app for daily payments?", "time": "1 min"},
    {"title": "Travel plans for this year (domestic/international)?", "time": "3 min"},
    {"title": "Which credit card do you use most often?", "time": "2 min"},
    {"title": "Health & fitness app preferences", "time": "2 min"},
    {"title": "Online learning — courses you've taken recently", "time": "3 min"},
    {"title": "Smartphone brand satisfaction survey", "time": "2 min"},
    {"title": "Cab booking — Ola vs Uber vs Rapido", "time": "1 min"},
    {"title": "Daily news source — app, TV, or newspaper?", "time": "1 min"},
    {"title": "Streaming music — Spotify, JioSaavn or Gaana?", "time": "1 min"},
    {"title": "Gaming preferences — mobile vs PC vs console", "time": "2 min"},
    {"title": "Banking habits: online vs branch visits", "time": "2 min"},
    {"title": "Insurance awareness — term, health, vehicle", "time": "3 min"},
    {"title": "EV adoption — would you buy an electric scooter?", "time": "2 min"},
    {"title": "Work-from-home vs office preference", "time": "2 min"},
    {"title": "Investment habits — stocks, MF or FD?", "time": "3 min"},
    {"title": "Smart home gadgets you own or want", "time": "2 min"},
    {"title": "Fashion shopping — Myntra, Ajio or offline?", "time": "2 min"},
    {"title": "Coffee or tea — and which brand?", "time": "1 min"},
    {"title": "Booking flights — MakeMyTrip, Goibibo, or direct?", "time": "2 min"},
    {"title": "Daily commute — bike, car, metro or bus?", "time": "1 min"},
    {"title": "Mobile network: Jio, Airtel, Vi or BSNL?", "time": "1 min"},
    {"title": "Grocery shopping — Blinkit, Zepto, Instamart?", "time": "2 min"},
    {"title": "Skincare & grooming brand preferences", "time": "2 min"},
    {"title": "Festive shopping budget for Diwali", "time": "2 min"},
    {"title": "Apps you can't live without (pick top 3)", "time": "2 min"},
    {"title": "Sleep & screen-time habits", "time": "2 min"},
    {"title": "How many hours of YouTube do you watch daily?", "time": "1 min"},
    {"title": "Which laptop brand do you trust most?", "time": "2 min"},
    {"title": "Do you prefer Android or iOS — and why?", "time": "2 min"},
    {"title": "Best smartphone under ₹20,000 in your opinion?", "time": "2 min"},
    {"title": "Frequency of online clothing returns", "time": "2 min"},
    {"title": "Are you satisfied with your broadband provider?", "time": "2 min"},
    {"title": "How often do you cook at home vs order in?", "time": "2 min"},
    {"title": "Top features you want in a fitness band", "time": "2 min"},
    {"title": "How do you discover new music?", "time": "1 min"},
    {"title": "Crypto investment — yes, no, or thinking about it?", "time": "3 min"},
    {"title": "Pets at home — dog, cat, both or none?", "time": "1 min"},
    {"title": "Average monthly grocery bill", "time": "2 min"},
    {"title": "Favourite social-media platform in 2026", "time": "1 min"},
    {"title": "How often do you read books (paper or e-book)?", "time": "2 min"},
    {"title": "Preferred mode of payment at retail stores", "time": "1 min"},
    {"title": "How many subscriptions do you currently pay for?", "time": "2 min"},
    {"title": "Most-used food brand at home", "time": "2 min"},
    {"title": "Are you planning to upgrade your phone this year?", "time": "1 min"},
    {"title": "Number of cards in your wallet (debit + credit)", "time": "1 min"},
    {"title": "Do you use voice assistants daily?", "time": "1 min"},
    {"title": "How often do you visit a coffee chain?", "time": "1 min"},
    {"title": "Online dating apps — opinions and usage", "time": "3 min"},
    {"title": "Books vs movies — which do you prefer?", "time": "1 min"},
    {"title": "Best vacation destination in India?", "time": "2 min"},
    {"title": "Have you tried meal-kit subscription services?", "time": "2 min"},
    {"title": "Which festival do you spend the most on?", "time": "2 min"},
    {"title": "Air purifier — necessary or luxury?", "time": "2 min"},
    {"title": "Do you wear smart watches or analog?", "time": "1 min"},
    {"title": "Favourite brand of headphones / earbuds", "time": "1 min"},
    {"title": "How frequently do you upgrade your laptop?", "time": "2 min"},
    {"title": "Best e-commerce sale event of the year", "time": "2 min"},
    {"title": "Preferred mobile wallet (Paytm, PhonePe, GPay)?", "time": "1 min"},
    {"title": "Are tasks/earning apps better than gaming apps?", "time": "1 min"},
    {"title": "Average time spent on Instagram daily", "time": "1 min"},
    {"title": "Tea brand you buy most often", "time": "1 min"},
    {"title": "Do you use cashback apps regularly?", "time": "1 min"},
    {"title": "Favourite cricket team in IPL", "time": "1 min"},
    {"title": "Football vs cricket — which do you watch more?", "time": "1 min"},
    {"title": "How comfortable are you with English keyboard typing?", "time": "1 min"},
    {"title": "Have you ever invested in mutual funds via SIP?", "time": "2 min"},
    {"title": "Are you saving for a house, car or travel?", "time": "2 min"},
    {"title": "Preferred genre of OTT content (drama, comedy, thriller)", "time": "1 min"},
    {"title": "What's your typical Saturday entertainment?", "time": "1 min"},
    {"title": "Brand of two-wheeler you ride", "time": "1 min"},
    {"title": "Are EV charging stations available near you?", "time": "2 min"},
    {"title": "Have you used a drone or want to?", "time": "1 min"},
    {"title": "Do you prefer night-owl or early-bird routine?", "time": "1 min"},
    {"title": "Workout style — gym, home, outdoor?", "time": "2 min"},
    {"title": "How important is brand loyalty to you?", "time": "2 min"},
    {"title": "Have you bought a refurbished phone before?", "time": "2 min"},
    {"title": "Travel insurance — yes or no?", "time": "2 min"},
    {"title": "Have you taken a personal loan recently?", "time": "2 min"},
    {"title": "Best chocolate brand in India?", "time": "1 min"},
    {"title": "Have you tried any meal-replacement drinks?", "time": "1 min"},
    {"title": "Daily intake of water (glasses)?", "time": "1 min"},
    {"title": "Do you use any digital journaling app?", "time": "1 min"},
    {"title": "What time do you typically wake up on weekdays?", "time": "1 min"},
    {"title": "Have you tried fasting (intermittent or otherwise)?", "time": "2 min"},
    {"title": "Do you follow finance influencers on Instagram?", "time": "1 min"},
    {"title": "Cinema vs OTT — which do you prefer for new releases?", "time": "1 min"},
    {"title": "Favourite type of cuisine to order online", "time": "1 min"},
    {"title": "Have you ever returned an electronic gadget? Why?", "time": "2 min"},
    {"title": "Do you trust reviews on Amazon/Flipkart?", "time": "2 min"},
    {"title": "Which fast-food chain do you order from most?", "time": "1 min"},
    {"title": "How often do you change your hairstyle?", "time": "1 min"},
    {"title": "Have you used AI tools like ChatGPT or Gemini?", "time": "2 min"},
    {"title": "Best app to learn a new skill — Udemy, Coursera, others?", "time": "2 min"},
    {"title": "Are you planning to study abroad?", "time": "2 min"},
    {"title": "Internet speed at home (Mbps)?", "time": "1 min"},
    {"title": "Phones per household — average count", "time": "1 min"},
    {"title": "Where do you save your passwords?", "time": "2 min"},
    {"title": "Have you tried foldable phones?", "time": "1 min"},
    {"title": "Best DSLR or mirrorless camera brand?", "time": "2 min"},
    {"title": "Have you ever rented furniture or appliances?", "time": "2 min"},
    {"title": "What's your favourite outdoor sport?", "time": "1 min"},
    {"title": "How often do you visit malls vs online shop?", "time": "2 min"},
    {"title": "Have you ever attended a live concert?", "time": "1 min"},
    {"title": "Are you a member of any loyalty program?", "time": "2 min"},
    {"title": "Most-used messaging app", "time": "1 min"},
    {"title": "How many email accounts do you actively use?", "time": "1 min"},
    {"title": "Are smartphones replacing your DSLR?", "time": "1 min"},
    {"title": "Do you back up photos to the cloud?", "time": "1 min"},
    {"title": "Have you tried podcasting or thought of starting one?", "time": "2 min"},
    {"title": "Are you OK paying for premium news content?", "time": "2 min"},
    {"title": "Have you used virtual reality (VR) before?", "time": "1 min"},
    {"title": "Have you tried noise-cancelling headphones?", "time": "1 min"},
    {"title": "Favourite Indian regional language for content?", "time": "1 min"},
    {"title": "Do you prefer dubbed or subtitled foreign shows?", "time": "1 min"},
    {"title": "How often do you eat street food?", "time": "1 min"},
    {"title": "Have you tried a cloud kitchen?", "time": "1 min"},
    {"title": "Do you order pet supplies online?", "time": "1 min"},
    {"title": "Are you happy with your current health insurance?", "time": "2 min"},
    {"title": "Have you visited a doctor via tele-consult?", "time": "2 min"},
    {"title": "How often do you exercise per week?", "time": "1 min"},
    {"title": "Have you tried yoga or meditation apps?", "time": "2 min"},
    {"title": "Favourite season — summer, winter or monsoon?", "time": "1 min"},
    {"title": "Do you prefer hatchback, sedan or SUV?", "time": "2 min"},
    {"title": "Best Tata car you've heard about?", "time": "1 min"},
    {"title": "Average monthly fuel spend", "time": "2 min"},
    {"title": "How comfortable are you with public transport?", "time": "1 min"},
    {"title": "Do you book Uber pool or solo rides?", "time": "1 min"},
    {"title": "Have you ever rented a car for travel?", "time": "1 min"},
    {"title": "Have you tried airline frequent-flyer programs?", "time": "2 min"},
    {"title": "Best low-cost airline experience", "time": "2 min"},
    {"title": "Train booking — IRCTC or third-party app?", "time": "1 min"},
    {"title": "Have you tried Vande Bharat trains yet?", "time": "1 min"},
    {"title": "Favourite hill station in India?", "time": "1 min"},
    {"title": "Beach or mountain holiday?", "time": "1 min"},
    {"title": "Have you used an Airbnb in India?", "time": "1 min"},
    {"title": "Average monthly spend on entertainment", "time": "2 min"},
    {"title": "Do you tip when ordering food online?", "time": "1 min"},
    {"title": "Favourite ice-cream brand", "time": "1 min"},
    {"title": "Vegetarian, non-veg, or eggetarian?", "time": "1 min"},
    {"title": "Have you tried plant-based meat?", "time": "1 min"},
    {"title": "Are you switching to millet-based diets?", "time": "1 min"},
    {"title": "Have you tried baking at home?", "time": "1 min"},
    {"title": "Have you used a kitchen subscription box?", "time": "2 min"},
    {"title": "How often do you eat out in a month?", "time": "1 min"},
    {"title": "Best bakery chain you visit", "time": "1 min"},
    {"title": "How many shoes do you own?", "time": "1 min"},
    {"title": "Have you tried online tailoring services?", "time": "1 min"},
    {"title": "Best perfume brand you've tried?", "time": "1 min"},
    {"title": "How often do you visit a salon?", "time": "1 min"},
    {"title": "Have you tried at-home salon services?", "time": "2 min"},
    {"title": "Have you used dating apps like Hinge or Bumble?", "time": "2 min"},
    {"title": "Are you part of any online community / forum?", "time": "1 min"},
    {"title": "Do you read newsletters on Substack?", "time": "1 min"},
    {"title": "Have you ever bought NFTs?", "time": "1 min"},
    {"title": "Do you trust AI for travel itinerary planning?", "time": "2 min"},
    {"title": "Do you use a smart speaker (Alexa, Google Home)?", "time": "1 min"},
    {"title": "Do you find online ads useful or annoying?", "time": "1 min"},
    {"title": "How important is dark-mode in apps for you?", "time": "1 min"},
    {"title": "Which OS update annoyed you most?", "time": "1 min"},
    {"title": "Have you ever used a digital detox app?", "time": "1 min"},
    {"title": "Do you keep multiple SIMs in your phone?", "time": "1 min"},
    {"title": "Is 5G stable in your area?", "time": "1 min"},
    {"title": "Are you on any wait-list for a launch product?", "time": "1 min"},
    {"title": "Have you tried subscription boxes (snacks, beauty)?", "time": "2 min"},
    {"title": "Do you participate in giveaways online?", "time": "1 min"},
    {"title": "Have you tried lucky-draw or scratch apps?", "time": "1 min"},
    {"title": "Do you watch product unboxing videos before buying?", "time": "1 min"},
    {"title": "Have you tried buying gold online?", "time": "1 min"},
    {"title": "Have you ever invested in P2P lending?", "time": "2 min"},
    {"title": "Have you opened a Demat account?", "time": "2 min"},
    {"title": "Do you trade in F&O or only equity?", "time": "2 min"},
    {"title": "Stocks vs Mutual Funds — preference?", "time": "2 min"},
    {"title": "How often do you check your CIBIL score?", "time": "1 min"},
    {"title": "Do you maintain a personal finance tracker?", "time": "2 min"},
    {"title": "Have you taken an EMI on appliances?", "time": "2 min"},
    {"title": "Do you use any tax-filing app?", "time": "2 min"},
    {"title": "Have you availed any home loan?", "time": "2 min"},
    {"title": "Are you planning to buy/rent a property in 2026?", "time": "2 min"},
    {"title": "Best real-estate platform you've used", "time": "2 min"},
    {"title": "Have you ever rented furniture monthly?", "time": "1 min"},
    {"title": "Have you tried co-working spaces?", "time": "1 min"},
    {"title": "Are you a startup employee, corporate or freelance?", "time": "1 min"},
    {"title": "Have you tried freelancing on Upwork/Fiverr?", "time": "2 min"},
    {"title": "Do you side-hustle for extra income?", "time": "2 min"},
    {"title": "Have you started a YouTube channel?", "time": "2 min"},
    {"title": "Do you post Reels/Shorts regularly?", "time": "1 min"},
    {"title": "Best AI image generator you've tried?", "time": "1 min"},
    {"title": "Have you tried using AI for résumé building?", "time": "1 min"},
    {"title": "Have you taken an online certification course?", "time": "2 min"},
    {"title": "Which language do you want to learn next?", "time": "1 min"},
    {"title": "Do you read self-help or fiction books more?", "time": "1 min"},
    {"title": "Have you tried audiobooks (Audible / Spotify)?", "time": "1 min"},
    {"title": "Best gym chain in your city?", "time": "1 min"},
    {"title": "Have you tried sports like badminton, TT, tennis?", "time": "1 min"},
    {"title": "Are you watching any K-drama right now?", "time": "1 min"},
    {"title": "Have you tried board games online?", "time": "1 min"},
    {"title": "Have you played BGMI / Free Fire?", "time": "1 min"},
    {"title": "Favourite mobile game in 2026?", "time": "1 min"},
    {"title": "Have you used cloud gaming services?", "time": "1 min"},
    {"title": "Do you stream gaming on YouTube/Twitch?", "time": "1 min"},
    {"title": "Best app for daily affirmations?", "time": "1 min"},
    {"title": "Have you tried a wellness retreat?", "time": "2 min"},
    {"title": "Do you support local farmer markets?", "time": "1 min"},
    {"title": "Do you carry your own water bottle outside?", "time": "1 min"},
    {"title": "Have you switched to eco-friendly products?", "time": "2 min"},
    {"title": "Have you ever recycled e-waste?", "time": "1 min"},
    {"title": "Are you in any WhatsApp deal-share group?", "time": "1 min"},
    {"title": "Have you tried online tutoring as student or teacher?", "time": "2 min"},
    {"title": "Best children's app/game for under-12s?", "time": "1 min"},
    {"title": "Do you have a child's account on streaming apps?", "time": "1 min"},
    {"title": "Have you tried smart-baby monitors?", "time": "1 min"},
    {"title": "Have you used an online doctor for kids?", "time": "2 min"},
    {"title": "Do you order school supplies online?", "time": "1 min"},
    {"title": "Have you tried hobby classes online?", "time": "1 min"},
    {"title": "Favourite DIY/craft activity?", "time": "1 min"},
    {"title": "Have you joined a paid community (Discord, etc.)?", "time": "2 min"},
    {"title": "Do you follow tech YouTubers regularly?", "time": "1 min"},
]

QUIZ_POOL = [
    {"q": "Which is India's official currency?", "a": ["Rupee", "Dollar", "Euro", "Yen"], "c": 0},
    {"q": "Capital of Maharashtra?", "a": ["Pune", "Mumbai", "Nagpur", "Nashik"], "c": 1},
    {"q": "1 INR = how many points in TaskMint?", "a": ["10", "50", "100", "1000"], "c": 2},
    {"q": "Which app pays via UPI instantly?", "a": ["TaskMint", "—", "—", "—"], "c": 0},
    {"q": "Daily check-in reward grows with…", "a": ["Random", "Streak", "Mood", "Hour"], "c": 1},
    {"q": "Capital of India?", "a": ["Mumbai", "Kolkata", "New Delhi", "Chennai"], "c": 2},
    {"q": "Largest planet in solar system?", "a": ["Earth", "Jupiter", "Saturn", "Mars"], "c": 1},
    {"q": "Who wrote 'Wings of Fire'?", "a": ["Tagore", "Kalam", "Nehru", "Gandhi"], "c": 1},
    {"q": "National animal of India?", "a": ["Lion", "Elephant", "Tiger", "Peacock"], "c": 2},
    {"q": "Currency of Japan?", "a": ["Won", "Yuan", "Yen", "Ringgit"], "c": 2},
    {"q": "Highest mountain in the world?", "a": ["K2", "Everest", "Kanchenjunga", "Annapurna"], "c": 1},
    {"q": "Speed of light (approx)?", "a": ["3,00,000 km/s", "1,50,000 km/s", "5,00,000 km/s", "1,000 km/s"], "c": 0},
    {"q": "Which is a programming language?", "a": ["HTML", "Python", "CSS", "JSON"], "c": 1},
    {"q": "Which country is famous for sushi?", "a": ["China", "Korea", "Japan", "Thailand"], "c": 2},
    {"q": "Number of players in cricket team?", "a": ["9", "10", "11", "12"], "c": 2},
    {"q": "Which is the smallest prime number?", "a": ["0", "1", "2", "3"], "c": 2},
    {"q": "Which gas do plants absorb?", "a": ["Oxygen", "Nitrogen", "CO₂", "Hydrogen"], "c": 2},
    {"q": "PIN code 'Pin' stands for?", "a": ["Postal Index Number", "Public Index No.", "Postal Identification", "Pin Identification"], "c": 0},
    {"q": "Father of the Nation (India)?", "a": ["Nehru", "Gandhi", "Patel", "Bose"], "c": 1},
    {"q": "Which app is for video calling?", "a": ["WhatsApp", "Notepad", "Calculator", "Camera"], "c": 0},
    {"q": "Who invented the bulb?", "a": ["Tesla", "Edison", "Newton", "Einstein"], "c": 1},
    {"q": "Which is a search engine?", "a": ["Chrome", "Google", "Bing", "Both Google & Bing"], "c": 3},
    {"q": "₹1 = how many paise?", "a": ["10", "100", "1000", "50"], "c": 1},
    {"q": "Which is India's largest river?", "a": ["Yamuna", "Ganga", "Krishna", "Godavari"], "c": 1},
    {"q": "Number of states in India (2024)?", "a": ["27", "28", "29", "30"], "c": 1},
]


@api_router.get("/tasks/surveys/random")
async def random_surveys(limit: int = 5, _: dict = Depends(get_current_user)):
    """Return a fresh, randomly-shuffled subset of surveys for this open. Each
    survey also carries 5 multi-choice questions drawn from a shared generic
    bank so the UI can run a Quizzes-style sequential Q&A flow per survey."""
    n = max(1, min(limit, len(SURVEY_POOL)))
    sample = random.sample(SURVEY_POOL, n)
    meta = await get_app_meta()
    s_min = int(meta.get("survey_min", 30) or 30)
    s_max = int(meta.get("survey_max", 100) or 100)
    if s_max < s_min: s_max = s_min
    out = []
    for s in sample:
        qs = random.sample(SURVEY_QUESTION_BANK, 5)
        out.append({
            "id": str(uuid.uuid4()),
            "title": s["title"],
            "time": s["time"],
            "reward": random.randint(s_min, s_max),
            # Each question: { q: str, options: [str, str, ...] }
            "questions": qs,
        })
    return out


@api_router.get("/tasks/quizzes/random")
async def random_quizzes(limit: int = 5, _: dict = Depends(get_current_user)):
    """Return a fresh, randomly-shuffled subset of quiz questions."""
    n = max(1, min(limit, len(QUIZ_POOL)))
    return random.sample(QUIZ_POOL, n)


class SimpleTaskComplete(BaseModel):
    correct: int
    total: int

@api_router.post("/tasks/quiz")
async def complete_quiz(payload: SimpleTaskComplete, user: dict = Depends(get_current_user)):
    user = await reset_daily_limits_if_needed(user)
    if user.get("daily_quizzes_used", 0) >= 5:
        raise HTTPException(status_code=400, detail="Daily quiz limit reached")
    reward = await reward_range("quiz_min", "quiz_max")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$inc": {"daily_quizzes_used": 1}}
    )
    await add_points_and_log(user["user_id"], reward, "quiz", f"{payload.correct}/{payload.total}")
    return {"reward": reward, "remaining": 4 - user.get("daily_quizzes_used", 0)}

@api_router.post("/tasks/survey")
async def complete_survey(user: dict = Depends(get_current_user)):
    user = await reset_daily_limits_if_needed(user)
    if user.get("daily_surveys_used", 0) >= 5:
        raise HTTPException(status_code=400, detail="Daily survey limit reached")
    reward = await reward_range("survey_min", "survey_max")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$inc": {"daily_surveys_used": 1}}
    )
    await add_points_and_log(user["user_id"], reward, "survey", "Survey completed")
    return {"reward": reward, "remaining": 4 - user.get("daily_surveys_used", 0)}


# ---------- Visit Sites (admin-managed) ----------
class VisitSite(BaseModel):
    id: str = Field(default_factory=lambda: f"vs_{uuid.uuid4().hex[:10]}")
    title: str
    url: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VisitSiteCreate(BaseModel):
    title: str
    url: str
    active: bool = True


class VisitSiteUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    active: Optional[bool] = None


@api_router.get("/visit-sites")
async def list_visit_sites_public(_: dict = Depends(get_current_user)):
    """Public list of active visit sites for the Visit & Earn screen."""
    items = await db.visit_sites.find({"active": True}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return items


@api_router.get("/admin/visit-sites")
async def list_visit_sites_admin(_: dict = Depends(require_admin)):
    items = await db.visit_sites.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return items


@api_router.post("/admin/visit-sites", response_model=VisitSite)
async def create_visit_site(payload: VisitSiteCreate, _: dict = Depends(require_admin)):
    site = VisitSite(**payload.dict())
    await db.visit_sites.insert_one(site.dict())
    return site


@api_router.put("/admin/visit-sites/{site_id}", response_model=VisitSite)
async def update_visit_site(site_id: str, payload: VisitSiteUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.visit_sites.update_one({"id": site_id}, {"$set": update})
    site = await db.visit_sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return VisitSite(**site)


@api_router.delete("/admin/visit-sites/{site_id}")
async def delete_visit_site(site_id: str, _: dict = Depends(require_admin)):
    res = await db.visit_sites.delete_one({"id": site_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Site not found")
    return {"deleted": True}

@api_router.get("/campaign/{campaign_id}")
async def get_campaign_detail(campaign_id: str, user: dict = Depends(get_current_user)):
    cmp = await db.campaigns.find_one({"id": campaign_id, "active": True}, {"_id": 0})
    if not cmp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    completion = await db.campaign_completions.find_one(
        {"user_id": user["user_id"], "campaign_id": campaign_id}, {"_id": 0}
    )
    cmp["completion"] = completion
    # Live INR from the admin exchange ratio (App Config).
    meta = await get_app_meta()
    ratio = int(meta.get("exchange_points_per_inr", 100) or 100) or 100
    cmp["reward_inr"] = round(int(cmp.get("reward_points", 0) or 0) / float(ratio), 2)
    return cmp

@api_router.post("/tasks/campaign/{campaign_id}")
async def start_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    """Open link only — does NOT create completion. Frontend should submit later."""
    cmp = await db.campaigns.find_one({"id": campaign_id, "active": True}, {"_id": 0})
    if not cmp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"link_url": cmp.get("link_url", "")}

@api_router.post("/tasks/campaign/{campaign_id}/submit")
async def submit_campaign(
    campaign_id: str, payload: TaskSubmit, user: dict = Depends(get_current_user)
):
    cmp = await db.campaigns.find_one({"id": campaign_id, "active": True}, {"_id": 0})
    if not cmp:
        raise HTTPException(status_code=404, detail="Campaign not found")
    existing = await db.campaign_completions.find_one(
        {"user_id": user["user_id"], "campaign_id": campaign_id}, {"_id": 0}
    )
    if existing and existing["status"] in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"Task already {existing['status']}")

    # If previously rejected and admin reset -> remove old completion to allow retry
    if existing:
        await db.campaign_completions.delete_one({"id": existing["id"]})

    completion = CampaignCompletion(
        user_id=user["user_id"],
        user_name=user["name"],
        user_email=user["email"],
        campaign_id=campaign_id,
        campaign_name=cmp["name"],
        reward_points=cmp["reward_points"],
        form_field_1_value=payload.form_field_1_value or "",
        form_field_2_value=payload.form_field_2_value or "",
    )
    await db.campaign_completions.insert_one(completion.dict())
    return {"ok": True, "completion_id": completion.id, "status": "pending"}


# ---------- Wallet ----------
@api_router.get("/wallet/transactions")
async def transactions(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Optionally filter by `?category=campaign|games_task`.

    Legacy rows without an explicit `category` are treated as `games_task`
    (since campaigns are the only category we tag separately).
    """
    q: dict = {"user_id": user["user_id"]}
    if category in ("campaign", "games_task"):
        if category == "games_task":
            q["$or"] = [
                {"category": "games_task"},
                {"category": {"$exists": False}},
                {"category": None},
            ]
        else:
            q["category"] = "campaign"
    items = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Normalise: legacy rows without explicit category default to games_task.
    for t in items:
        if not t.get("category"):
            t["category"] = "games_task"
    return items


# ---------- Withdraw ----------
@api_router.post("/withdraw")
async def submit_withdraw(payload: WithdrawCreate, user: dict = Depends(get_current_user)):
    if payload.points <= 0:
        raise HTTPException(status_code=400, detail="Points must be positive")
    if not user.get("mobile_number"):
        raise HTTPException(status_code=400, detail="Please add your mobile number before withdrawing")
    if payload.method == "upi" and not payload.upi_id:
        raise HTTPException(status_code=400, detail="UPI ID required")
    if payload.method == "bank" and not (payload.bank_account and payload.bank_ifsc and payload.bank_holder):
        raise HTTPException(status_code=400, detail="Bank details required")

    # --- Single-wallet balance check ---
    balance = int(user.get("points", 0) or 0)
    if payload.points > balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance ({balance} pts available)",
        )

    # --- Admin-configurable min + exchange ratio + daily cap ---
    meta = await get_app_meta()
    min_points = int(meta.get("min_withdrawal", 10000) or 10000)
    ratio = int(user.get("custom_exchange_ratio") or meta.get("exchange_points_per_inr", 100) or 100)
    if ratio <= 0:
        ratio = 100
    daily_cap = int(meta.get("daily_withdrawal_limit", 2) or 2)
    if payload.points < min_points:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum withdrawal is {min_points} points (₹{round(min_points/ratio, 2)})",
        )

    # --- Daily cap ---
    today = today_str()
    wd_today_date = user.get("withdrawals_today_date")
    wd_today = int(user.get("withdrawals_today", 0) or 0) if wd_today_date == today else 0
    if wd_today >= daily_cap:
        raise HTTPException(status_code=400, detail=f"Daily withdrawal limit reached ({daily_cap} per day). Come back tomorrow.")

    inr = round(payload.points / float(ratio), 2)
    wd = WithdrawRequest(
        user_id=user["user_id"], user_name=user["name"], user_email=user["email"],
        method=payload.method, source="games_task", points=payload.points, inr_amount=inr,
        upi_id=payload.upi_id, bank_account=payload.bank_account,
        bank_ifsc=payload.bank_ifsc, bank_holder=payload.bank_holder,
    )
    await db.withdrawals.insert_one(wd.dict())
    # Deduct from the single wallet (points) + keep both legacy buckets in sync
    # so nothing reads a stale bucket value elsewhere. bump per-day counter.
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$inc": {
                "points": -payload.points,
                "games_task_points": -payload.points,
                "total_withdrawn": payload.points,
            },
            "$set": {
                "has_first_withdrawal": True,
                "withdrawals_today_date": today,
                "withdrawals_today": wd_today + 1,
            },
        },
    )
    txn = Transaction(
        user_id=user["user_id"], type="withdraw", source="withdraw",
        category="games_task", points=-payload.points,
        note=f"Withdraw {inr} INR via {payload.method}",
    )
    await db.transactions.insert_one(txn.dict())
    return wd.dict()

@api_router.get("/withdraw/history")
async def withdraw_history(user: dict = Depends(get_current_user)):
    items = await db.withdrawals.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


# ---------- Admin ----------
@api_router.get("/admin/banners")
async def admin_list_banners(_: dict = Depends(require_admin)):
    items = await db.banners.find({}, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(500)
    return items

@api_router.post("/admin/banners")
async def admin_create_banner(payload: BannerCreate, _: dict = Depends(require_admin)):
    b = Banner(**payload.dict())
    await db.banners.insert_one(b.dict())
    return b.dict()

@api_router.put("/admin/banners/{banner_id}")
async def admin_update_banner(banner_id: str, payload: BannerCreate, _: dict = Depends(require_admin)):
    await db.banners.update_one({"id": banner_id}, {"$set": payload.dict()})
    return {"ok": True}

@api_router.delete("/admin/banners/{banner_id}")
async def admin_delete_banner(banner_id: str, _: dict = Depends(require_admin)):
    await db.banners.delete_one({"id": banner_id})
    return {"ok": True}

@api_router.get("/admin/campaigns")
async def admin_list_campaigns(_: dict = Depends(require_admin)):
    items = await db.campaigns.find({}, {"_id": 0}).sort([("pinned", -1), ("created_at", -1)]).to_list(500)
    return items

@api_router.post("/admin/campaigns")
async def admin_create_campaign(payload: CampaignCreate, _: dict = Depends(require_admin)):
    c = Campaign(**payload.dict(), reward_inr=payload.reward_points / 100.0)
    await db.campaigns.insert_one(c.dict())
    return c.dict()

@api_router.put("/admin/campaigns/{campaign_id}")
async def admin_update_campaign(campaign_id: str, payload: CampaignCreate, _: dict = Depends(require_admin)):
    data = payload.dict()
    data["reward_inr"] = payload.reward_points / 100.0
    await db.campaigns.update_one({"id": campaign_id}, {"$set": data})
    return {"ok": True}

@api_router.delete("/admin/campaigns/{campaign_id}")
async def admin_delete_campaign(campaign_id: str, _: dict = Depends(require_admin)):
    await db.campaigns.delete_one({"id": campaign_id})
    return {"ok": True}

@api_router.get("/admin/withdrawals")
async def admin_list_withdrawals(_: dict = Depends(require_admin)):
    items = await db.withdrawals.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich each item with the user's mobile number (only one lookup per
    # unique user_id, not per row).
    ids = {w["user_id"] for w in items}
    mobiles: dict = {}
    async for u in db.users.find(
        {"user_id": {"$in": list(ids)}},
        {"_id": 0, "user_id": 1, "mobile_number": 1},
    ):
        mobiles[u["user_id"]] = u.get("mobile_number")
    for w in items:
        w["user_mobile"] = mobiles.get(w["user_id"])
    return items

@api_router.put("/admin/withdrawals/{withdraw_id}")
async def admin_update_withdraw(withdraw_id: str, payload: WithdrawUpdate, _: dict = Depends(require_admin)):
    wd = await db.withdrawals.find_one({"id": withdraw_id}, {"_id": 0})
    if not wd:
        raise HTTPException(status_code=404, detail="Not found")
    update = {"status": payload.status, "admin_note": payload.admin_note or "", "updated_at": now_iso()}
    await db.withdrawals.update_one({"id": withdraw_id}, {"$set": update})

    # ----- Referral payout on successful withdrawal (mode = withdrawal / both) -----
    if payload.status == "successful" and wd.get("status") != "successful":
        meta = await get_app_meta()
        mode = (meta.get("referral_mode") or "streak").lower()
        if mode in ("withdrawal", "both"):
            user_doc = await db.users.find_one({"user_id": wd["user_id"]}, {"_id": 0, "referred_by": 1})
            referrer_id = (user_doc or {}).get("referred_by")
            if referrer_id:
                referrer = await db.users.find_one({"user_id": referrer_id}, {"_id": 0, "user_id": 1})
                if referrer:
                    # Count successful withdrawals so far for this referred user.
                    paid_count = await db.withdrawals.count_documents({
                        "user_id": wd["user_id"], "status": "successful"
                    })
                    # Find matching tier where withdrawals == paid_count.
                    tiers = meta.get("referral_withdrawal_tiers") or []
                    matched = next((t for t in tiers if int(t.get("withdrawals", 0)) == paid_count), None)
                    if matched and int(matched.get("points", 0)) > 0:
                        bonus = int(matched["points"])
                        await add_points_and_log(
                            referrer["user_id"], bonus, "referral",
                            f"Referral bonus: referee {wd['user_name']} completed withdrawal #{paid_count}",
                            category="campaign",
                        )

    if payload.status == "rejected" and wd["status"] != "rejected":
        # Single wallet: refund to points (+ keep legacy bucket in sync).
        await db.users.update_one(
            {"user_id": wd["user_id"]},
            {"$inc": {"points": wd["points"], "games_task_points": wd["points"]}},
        )
        txn = Transaction(
            user_id=wd["user_id"], type="earn", source="withdraw",
            category="games_task", points=wd["points"],
            note=f"Withdrawal {withdraw_id} refunded",
        )
        await db.transactions.insert_one(txn.dict())
    return {"ok": True}

@api_router.get("/admin/links")
async def admin_get_links(_: dict = Depends(require_admin)):
    doc = await db.app_links.find_one({"_id": "singleton"}, {"_id": 0})
    return doc or AppLinks().dict()

@api_router.put("/admin/links")
async def admin_update_links(payload: AppLinks, _: dict = Depends(require_admin)):
    await db.app_links.update_one({"_id": "singleton"}, {"$set": payload.dict()}, upsert=True)
    return payload.dict()


# ---------- Admin: Profile Quick Access buttons ----------
@api_router.get("/admin/profile-buttons")
async def admin_get_profile_buttons(_: dict = Depends(require_admin)):
    doc = await db.profile_buttons.find_one({"_id": "singleton"}, {"_id": 0})
    items = (doc or {}).get("buttons", []) or []
    if not items:
        items = _default_profile_buttons()
    items.sort(key=lambda b: int(b.get("sort_order", 0) or 0))
    return {"buttons": items}


@api_router.put("/admin/profile-buttons")
async def admin_update_profile_buttons(
    payload: ProfileButtonsConfig, _: dict = Depends(require_admin)
):
    # Normalise: assign ids to any new buttons missing one, then save.
    items: List[Dict[str, Any]] = []
    for b in payload.buttons:
        d = b.dict()
        if not d.get("id"):
            d["id"] = f"pb_{uuid.uuid4().hex[:8]}"
        items.append(d)
    items.sort(key=lambda b: int(b.get("sort_order", 0) or 0))
    await db.profile_buttons.update_one(
        {"_id": "singleton"},
        {"$set": {"buttons": items}},
        upsert=True,
    )
    return {"buttons": items}


# ---------- Admin: Earn Cards (reorder, hide/show, toggle hero) ----------
@api_router.get("/admin/earn-cards")
async def admin_get_earn_cards(_: dict = Depends(require_admin)):
    doc = await db.earn_cards.find_one({"_id": "singleton"}, {"_id": 0})
    items = (doc or {}).get("cards", []) or []
    if not items:
        items = _default_earn_cards()
    items.sort(key=lambda c: int(c.get("sort_order", 0) or 0))
    return {"cards": items}


@api_router.put("/admin/earn-cards")
async def admin_update_earn_cards(
    payload: EarnCardsConfig, _: dict = Depends(require_admin)
):
    items: List[Dict[str, Any]] = []
    for c in payload.cards:
        d = c.dict()
        if not d.get("id"):
            d["id"] = f"ec_{uuid.uuid4().hex[:8]}"
        items.append(d)
    items.sort(key=lambda c: int(c.get("sort_order", 0) or 0))
    await db.earn_cards.update_one(
        {"_id": "singleton"},
        {"$set": {"cards": items}},
        upsert=True,
    )
    return {"cards": items}


@api_router.post("/admin/earn-cards/reset")
async def admin_reset_earn_cards(_: dict = Depends(require_admin)):
    """Wipe admin config and revert to the built-in 15-card seed."""
    await db.earn_cards.delete_one({"_id": "singleton"})
    return {"cards": _default_earn_cards()}


@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    users_count = await db.users.count_documents({})
    pending = await db.withdrawals.count_documents({"status": "pending"})
    successful = await db.withdrawals.count_documents({"status": "successful"})
    today = today_str()
    active_today = await db.users.count_documents({"last_activity_date": today})
    pending_campaigns = await db.campaign_completions.count_documents({"status": "pending"})
    return {
        "users": users_count,
        "pending_withdrawals": pending,
        "successful_withdrawals": successful,
        "active_today": active_today,
        "pending_campaigns": pending_campaigns,
    }


# ---------- Admin: Users ----------
@api_router.get("/admin/users")
async def admin_list_users(q: str = "", active: str = "", admin: dict = Depends(require_admin)):
    flt: dict = {}
    if q:
        # Search by name (primary) or mobile_number only.
        flt = {"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"mobile_number": {"$regex": q, "$options": "i"}},
        ]}
    if active in ("1", "true", "yes"):
        flt["last_activity_date"] = today_str()
    items = await db.users.find(flt, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Attach referrals_count for each user so the admin can see how many people they referred.
    user_ids = [u.get("user_id") for u in items if u.get("user_id")]
    counts: dict = {}
    if user_ids:
        pipeline = [
            {"$match": {"referred_by": {"$in": user_ids}}},
            {"$group": {"_id": "$referred_by", "n": {"$sum": 1}}},
        ]
        async for row in db.users.aggregate(pipeline):
            counts[row["_id"]] = row["n"]
    for u in items:
        u["referrals_count"] = counts.get(u.get("user_id"), 0)
    return items

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.setdefault("total_withdrawn", 0)
    u.setdefault("total_earned", 0)
    u.setdefault("total_tasks", 0)
    u.setdefault("streak", 0)
    u["referrals_count"] = await db.users.count_documents({"referred_by": user_id})
    return u

@api_router.post("/admin/users/{user_id}/adjust-points")
async def admin_adjust_points(user_id: str, payload: AdjustPoints, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    source = payload.source if payload.source in ("campaign", "games_task") else "games_task"
    bucket_field = "campaign_points" if source == "campaign" else "games_task_points"
    bucket_balance = int(u.get(bucket_field, 0) or 0)
    # Block under-zero on EITHER the bucket or the legacy total.
    if payload.delta < 0 and (bucket_balance + payload.delta < 0 or u.get("points", 0) + payload.delta < 0):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reduce {source.replace('_', ' & ')} below 0 ({bucket_balance} pts available)",
        )
    update = {"$inc": {"points": payload.delta, bucket_field: payload.delta}}
    if payload.delta > 0:
        update["$inc"]["total_earned"] = payload.delta
    await db.users.update_one({"user_id": user_id}, update)
    txn = Transaction(
        user_id=user_id,
        type="earn" if payload.delta > 0 else "withdraw",
        source="admin",
        category=source,
        points=payload.delta,
        note=payload.reason,
    )
    await db.transactions.insert_one(txn.dict())
    return {"ok": True, "new_points": (u.get("points", 0) + payload.delta)}


# ---------- Admin: Campaign Completions ----------
@api_router.get("/admin/campaign-completions")
async def admin_list_completions(_: dict = Depends(require_admin)):
    items = await db.campaign_completions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = {c["user_id"] for c in items}
    mobiles: dict = {}
    async for u in db.users.find(
        {"user_id": {"$in": list(ids)}},
        {"_id": 0, "user_id": 1, "mobile_number": 1},
    ):
        mobiles[u["user_id"]] = u.get("mobile_number")
    for c in items:
        c["user_mobile"] = mobiles.get(c["user_id"])
    return items

@api_router.put("/admin/campaign-completions/{completion_id}")
async def admin_update_completion(
    completion_id: str, payload: CampaignCompletionUpdate, _: dict = Depends(require_admin)
):
    c = await db.campaign_completions.find_one({"id": completion_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if c["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Already {c['status']}")
    await db.campaign_completions.update_one(
        {"id": completion_id},
        {"$set": {"status": payload.status, "admin_note": payload.admin_note or "", "updated_at": now_iso()}},
    )
    if payload.status == "approved":
        original_points = int(c.get("reward_points", 0) or 0)
        approved_points = payload.approved_points
        if approved_points is None:
            approved_points = original_points
        approved_points = max(0, min(int(approved_points), original_points))
        # Persist the actual credited amount so a later Reset can deduct it.
        await db.campaign_completions.update_one(
            {"id": completion_id}, {"$set": {"credited_points": approved_points}}
        )

        # 1) Credit the user's wallet with whatever the admin approved (could be 0).
        if approved_points > 0:
            await add_points_and_log(
                c["user_id"], approved_points, "campaign",
                f"{c['campaign_name']} approved",
                category="campaign",
            )

        # 2) If admin reduced the payout (or paid 0), record a successful
        # withdrawal entry for the ORIGINAL reward so the user sees a paid-out
        # row in their withdraw history (matches manual payout outside the
        # in-app wallet). Use the campaign name as the destination descriptor
        # rather than the user-submitted UPI / holder fields.
        if approved_points < original_points and original_points > 0:
            target_user = await db.users.find_one(
                {"user_id": c["user_id"]},
                {"_id": 0, "custom_exchange_ratio": 1},
            )
            meta = await get_app_meta()
            ratio = int(
                (target_user or {}).get("custom_exchange_ratio")
                or meta.get("exchange_points_per_inr", 100)
                or 100
            )
            if ratio <= 0:
                ratio = 100
            wd = WithdrawRequest(
                user_id=c["user_id"],
                user_name=c.get("user_name", ""),
                user_email=c.get("user_email", ""),
                method="upi",
                source="campaign",
                points=original_points,
                inr_amount=round(original_points / float(ratio), 2),
                upi_id=c.get("campaign_name", ""),
                status="successful",
                admin_note=f"Auto-recorded for {c['campaign_name']} approval (paid externally)",
            )
            wd_doc = wd.dict()
            wd_doc["updated_at"] = now_iso()
            wd_doc["auto_created"] = True
            wd_doc["completion_id"] = completion_id
            await db.withdrawals.insert_one(wd_doc)
            # Mirror the withdrawal into the transaction ledger so the Wallet
            # tab and admin Withdrawals filter show automatic campaign payouts too.
            txn = Transaction(
                user_id=c["user_id"], type="withdraw", source="withdraw",
                category="campaign", points=-original_points,
                note=f"Auto-recorded for {c['campaign_name']} approval (paid externally)",
            )
            await db.transactions.insert_one(txn.dict())
            # Also keep total_withdrawn in sync for the user.
            await db.users.update_one(
                {"user_id": c["user_id"]},
                {"$inc": {"total_withdrawn": original_points},
                 "$set": {"has_first_withdrawal": True}},
            )
    return {"ok": True}

@api_router.delete("/admin/campaign-completions/{completion_id}")
async def admin_reset_completion(
    completion_id: str, reason: str = "", _: dict = Depends(require_admin)
):
    """Reset a completion: delete it so the user can re-submit. If it was
    approved, deduct the credited reward from the user's wallet. `reason` is
    logged on the deduction transaction."""
    c = await db.campaign_completions.find_one({"id": completion_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    # If the task was approved, deduct the reward that was credited.
    if c.get("status") == "approved":
        credited = int(c.get("credited_points", c.get("reward_points", 0)) or 0)
        if credited > 0:
            await db.users.update_one(
                {"user_id": c["user_id"]},
                {"$inc": {"points": -credited, "games_task_points": -credited}},
            )
            txn = Transaction(
                user_id=c["user_id"], type="withdraw", source="admin",
                category="campaign", points=-credited,
                note=f"Task '{c.get('campaign_name','')}' reset by admin"
                     + (f" — {reason}" if reason else ""),
            )
            await db.transactions.insert_one(txn.dict())
    # Delete the completion entirely so the user can re-submit.
    await db.campaign_completions.delete_one({"id": completion_id})
    return {"ok": True, "reason": reason, "deducted": c.get("status") == "approved"}


# ---------- Image upload (base64) ----------
class ImageUpload(BaseModel):
    data_url: str  # data:image/jpeg;base64,...

@api_router.post("/admin/upload-image")
async def admin_upload_image(payload: ImageUpload, _: dict = Depends(require_admin)):
    """Accept a base64 data URL and store as-is. Returns the same URL for use in image_url/logo_url fields."""
    s = payload.data_url.strip()
    if not s.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Must be a data:image/* URL")
    # 1.4 MB cap (base64 expands ~33%)
    if len(s) > 1_400_000:
        raise HTTPException(status_code=400, detail="Image too large (max ~1MB original)")
    return {"url": s}


# ---------- Admin: User transactions ----------
@api_router.get("/admin/users/{user_id}/transactions")
async def admin_user_transactions(user_id: str, category: Optional[str] = None, _: dict = Depends(require_admin)):
    q: dict = {"user_id": user_id}
    if category in ("campaign", "games_task"):
        if category == "games_task":
            q["$or"] = [
                {"category": "games_task"},
                {"category": {"$exists": False}},
                {"category": None},
            ]
        else:
            q["category"] = "campaign"
    items = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Normalise legacy rows so the FE can rely on `category`.
    for t in items:
        if not t.get("category"):
            t["category"] = "games_task"
    return items

class UserOverrides(BaseModel):
    custom_exchange_ratio: Optional[int] = None
    custom_withdraw_amounts: Optional[List[int]] = None

@api_router.put("/admin/users/{user_id}/overrides")
async def admin_set_user_overrides(user_id: str, payload: UserOverrides, _: dict = Depends(require_admin)):
    """Set per-user exchange ratio and/or withdraw amount chips. Send null to
    clear an override (falls back to the global App Config value)."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    ratio = payload.custom_exchange_ratio
    amounts = payload.custom_withdraw_amounts
    upd = {
        "custom_exchange_ratio": int(ratio) if ratio else None,
        "custom_withdraw_amounts": [int(x) for x in amounts if int(x) > 0] if amounts else None,
    }
    await db.users.update_one({"user_id": user_id}, {"$set": upd})
    return {"ok": True, **upd}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    """Permanently delete a user, their sessions, transactions, completions and withdrawals."""
    if user_id == admin.get("user_id"):
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.transactions.delete_many({"user_id": user_id})
    await db.campaign_completions.delete_many({"user_id": user_id})
    await db.withdrawals.delete_many({"user_id": user_id})
    return {"ok": True, "deleted_user_id": user_id}


# ---------- Admin: Withdraw Settings ----------
@api_router.get("/admin/withdraw-settings")
async def admin_get_withdraw_settings(_: dict = Depends(require_admin)):
    doc = await db.withdraw_settings.find_one({"_id": "singleton"}, {"_id": 0})
    return doc or WithdrawSettings().dict()

@api_router.put("/admin/withdraw-settings")
async def admin_update_withdraw_settings(payload: WithdrawSettings, _: dict = Depends(require_admin)):
    await db.withdraw_settings.update_one(
        {"_id": "singleton"}, {"$set": payload.dict()}, upsert=True
    )
    return payload.dict()


# ---------- Admin: Referral Settings ----------
@api_router.get("/admin/referral-settings")
async def admin_get_referral_settings(_: dict = Depends(require_admin)):
    return await get_referral_settings()

@api_router.put("/admin/referral-settings")
async def admin_update_referral_settings(payload: ReferralSettings, _: dict = Depends(require_admin)):
    data = payload.dict()
    if data["streak_7_reward_points"] < 0 or data["streak_15_reward_points"] < 0:
        raise HTTPException(status_code=400, detail="Amounts must be ≥ 0")
    for t in data.get("tiers") or []:
        if t.get("streak_days", 0) <= 0 or t.get("points", 0) < 0:
            raise HTTPException(status_code=400, detail="Tier streak_days must be > 0 and points >= 0")
    await db.referral_settings.update_one(
        {"_id": "singleton"}, {"$set": data}, upsert=True
    )
    return data


# ---------- AdMob Settings ----------
@api_router.get("/admob-settings")
async def get_admob_settings():
    """Public read of the current AdMob unit IDs so the app can refresh them remotely."""
    doc = await db.app_settings.find_one({"_id": "admob"}, {"_id": 0})
    return doc or AdMobSettings().dict()

@api_router.get("/admin/admob-settings")
async def admin_get_admob_settings(_: dict = Depends(require_admin)):
    doc = await db.app_settings.find_one({"_id": "admob"}, {"_id": 0})
    return doc or AdMobSettings().dict()

@api_router.put("/admin/admob-settings")
async def admin_update_admob_settings(payload: AdMobSettings, _: dict = Depends(require_admin)):
    await db.app_settings.update_one(
        {"_id": "admob"}, {"$set": payload.dict()}, upsert=True
    )
    return payload.dict()


# ---------- App Meta (per-task rewards, exchange ratio, mins, referral mode, maintenance) ----------
@api_router.get("/admin/app-config")
async def admin_get_app_config(_: dict = Depends(require_admin)):
    return await get_app_meta()

@api_router.put("/admin/app-config")
async def admin_update_app_config(payload: AppMetaSettings, _: dict = Depends(require_admin)):
    await db.app_settings.update_one(
        {"_id": "meta"}, {"$set": payload.dict()}, upsert=True
    )
    return payload.dict()


# ---------- App Version ----------
@api_router.get("/version")
async def get_app_version():
    doc = await db.app_settings.find_one({"_id": "version"}, {"_id": 0})
    return doc or AppVersionInfo().dict()

@api_router.get("/admin/version")
async def admin_get_app_version(_: dict = Depends(require_admin)):
    doc = await db.app_settings.find_one({"_id": "version"}, {"_id": 0})
    return doc or AppVersionInfo().dict()

@api_router.put("/admin/version")
async def admin_update_app_version(payload: AppVersionInfo, _: dict = Depends(require_admin)):
    await db.app_settings.update_one(
        {"_id": "version"}, {"$set": payload.dict()}, upsert=True
    )
    return payload.dict()


# ---------- Mobile number ----------
@api_router.post("/profile/mobile")
async def set_profile_mobile(payload: MobileNumberSet, user: dict = Depends(get_current_user)):
    """Set the user's mobile number — only allowed once (used for first withdrawal)."""
    if user.get("mobile_number"):
        raise HTTPException(status_code=400, detail="Mobile number already set")
    n1 = (payload.mobile_number or "").strip()
    n2 = (payload.confirm_mobile_number or "").strip()
    if not n1 or len(n1) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    if n1 != n2:
        raise HTTPException(status_code=400, detail="Mobile numbers do not match")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"mobile_number": n1}}
    )
    return {"ok": True, "mobile_number": n1}


# ---------- Referral History ----------
@api_router.get("/referrals/history")
async def referrals_history(user: dict = Depends(get_current_user)):
    """Return the list of users that signed up using my code, with their streak + check-in info."""
    rows = await db.users.find(
        {"referred_by": user["user_id"]},
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "streak": 1,
            "last_checkin": 1,
            "created_at": 1,
            "referral_rewards_paid": 1,
        },
    ).sort("created_at", -1).to_list(500)
    out = []
    for r in rows:
        out.append({
            "user_id": r.get("user_id"),
            "name": r.get("name"),
            "streak": r.get("streak", 0),
            "last_checkin": r.get("last_checkin"),
            "joined_at": r.get("created_at"),
            "rewards_paid": r.get("referral_rewards_paid", []) or [],
        })
    return out


# ---------- Admin: Referral stats per user ----------
@api_router.get("/admin/users/{user_id}/referrals")
async def admin_user_referrals(user_id: str, _: dict = Depends(require_admin)):
    rows = await db.users.find(
        {"referred_by": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return [{
        "user_id": r.get("user_id"),
        "name": r.get("name"),
        "mobile_number": r.get("mobile_number"),
        "streak": r.get("streak", 0),
        "last_checkin": r.get("last_checkin"),
        "joined_at": r.get("created_at"),
    } for r in rows]


# ---------- Admin: Per-user drill-downs ----------
@api_router.get("/admin/users/{user_id}/withdrawals")
async def admin_user_withdrawals(user_id: str, _: dict = Depends(require_admin)):
    """Withdraw history for a user — newest first."""
    items = await db.withdrawals.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return items

@api_router.get("/admin/users/{user_id}/completions")
async def admin_user_completions(user_id: str, _: dict = Depends(require_admin)):
    """High-paying task (campaign) history for a user — newest first."""
    items = await db.campaign_completions.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return items

@api_router.get("/admin/users/{user_id}/checkins")
async def admin_user_checkins(user_id: str, _: dict = Depends(require_admin)):
    """Daily check-in history — derived from the user's transactions."""
    items = await db.transactions.find(
        {"user_id": user_id, "source": "checkin"}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return items

@api_router.get("/admin/users/{user_id}/earn-history")
async def admin_user_earn_history(user_id: str, _: dict = Depends(require_admin)):
    """Earn-tab task history: spin, scratch, watch, visit, quiz, survey rewards only."""
    items = await db.transactions.find(
        {"user_id": user_id, "source": {"$in": ["spin", "scratch", "watch", "visit", "quiz", "survey"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    return items


@api_router.get("/admin/users/{user_id}/stats")
async def admin_user_stats(user_id: str, _: dict = Depends(require_admin)):
    """Comprehensive per-user metrics shown in the admin user-detail Stats tile.

    All point→INR conversions use the platform rule of 100 pts = ₹1.
    """
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    def to_inr(p: int) -> float:
        return round((p or 0) / 100.0, 2)

    # 1. Days since signup
    created_at = user.get("created_at")
    days_since_signup = 0
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            days_since_signup = max(0, (datetime.now(timezone.utc) - dt).days)
        except Exception:
            pass

    # 2. Active days — distinct YYYY-MM-DD across all transactions
    active_days_set = set()
    longest_streak = 0
    cur_streak = 0
    prev_date: Optional[datetime] = None
    checkin_dates: list = []
    async for t in db.transactions.find(
        {"user_id": user_id}, {"_id": 0, "created_at": 1, "source": 1}
    ).sort("created_at", 1):
        try:
            d = datetime.fromisoformat(t["created_at"]).date()
        except Exception:
            continue
        active_days_set.add(d.isoformat())
        if t.get("source") == "checkin":
            checkin_dates.append(d)
    # Longest consecutive check-in streak
    checkin_dates = sorted(set(checkin_dates))
    for d in checkin_dates:
        if prev_date is not None and (d - prev_date).days == 1:
            cur_streak += 1
        else:
            cur_streak = 1
        longest_streak = max(longest_streak, cur_streak)
        prev_date = d

    # 3. Earnings grouped by category
    earn_by_cat = {"campaign": 0, "games_task": 0}
    async for row in db.transactions.aggregate([
        {"$match": {"user_id": user_id, "points": {"$gt": 0}}},
        {"$group": {
            "_id": {"$ifNull": ["$category", "games_task"]},
            "total": {"$sum": "$points"},
        }},
    ]):
        cat = row["_id"] if row["_id"] in ("campaign", "games_task") else "games_task"
        earn_by_cat[cat] = earn_by_cat.get(cat, 0) + int(row.get("total", 0))

    # 4. Campaign completions counts
    campaigns_approved = await db.campaign_completions.count_documents(
        {"user_id": user_id, "status": "approved"}
    )
    campaigns_rejected = await db.campaign_completions.count_documents(
        {"user_id": user_id, "status": "rejected"}
    )
    campaigns_pending = await db.campaign_completions.count_documents(
        {"user_id": user_id, "status": "pending"}
    )

    # 5. Referrals
    total_referrals = await db.users.count_documents({"referred_by": user_id})
    referral_pts = 0
    async for row in db.transactions.aggregate([
        {"$match": {"user_id": user_id, "source": "referral", "points": {"$gt": 0}}},
        {"$group": {"_id": None, "total": {"$sum": "$points"}}},
    ]):
        referral_pts = int(row.get("total", 0))

    # 6. Withdrawals
    success_pts = 0
    rejected_pts = 0
    pending_pts = 0
    async for row in db.withdrawals.aggregate([
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$status", "total": {"$sum": "$points"}}},
    ]):
        s = row["_id"]
        v = int(row.get("total", 0))
        if s == "successful":
            success_pts = v
        elif s == "rejected":
            rejected_pts = v
        elif s == "pending":
            pending_pts = v

    available_pts = int(user.get("points", 0) or 0)
    total_earned_pts = int(user.get("total_earned", 0) or 0)
    current_streak = int(user.get("streak", 0) or 0)

    return {
        "days_since_signup": days_since_signup,
        "active_days": len(active_days_set),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "available_points": available_pts,
        "available_inr": to_inr(available_pts),
        "total_earned_points": total_earned_pts,
        "total_earned_inr": to_inr(total_earned_pts),
        "campaigns_approved": campaigns_approved,
        "campaigns_rejected": campaigns_rejected,
        "campaigns_pending": campaigns_pending,
        "campaign_earned_points": earn_by_cat.get("campaign", 0),
        "campaign_earned_inr": to_inr(earn_by_cat.get("campaign", 0)),
        "games_task_earned_points": earn_by_cat.get("games_task", 0),
        "games_task_earned_inr": to_inr(earn_by_cat.get("games_task", 0)),
        "total_referrals": total_referrals,
        "referral_earned_points": referral_pts,
        "referral_earned_inr": to_inr(referral_pts),
        "withdrawal_successful_points": success_pts,
        "withdrawal_successful_inr": to_inr(success_pts),
        "withdrawal_rejected_points": rejected_pts,
        "withdrawal_rejected_inr": to_inr(rejected_pts),
        "withdrawal_pending_points": pending_pts,
        "withdrawal_pending_inr": to_inr(pending_pts),
    }


# ---------- Seed ----------
async def migrate_duplicate_admins():
    """One-time migration: collapse all legacy "Altaf (Admin)" device-user rows
    into a single canonical admin record (`user_id == ADMIN_USER_ID`).

    Each legacy row is restored to a normal device user (name = "User<XXXX>",
    placeholder email, fresh referral code) so the original device owner gets
    their account back the next time they open the app.
    """
    # 1. Ensure exactly one canonical admin record exists.
    canonical = await db.users.find_one({"user_id": ADMIN_USER_ID}, {"_id": 0})
    if not canonical:
        canonical = User(
            user_id=ADMIN_USER_ID,
            email=ADMIN_EMAIL,
            name="Altaf (Admin)",
            picture=None,
            is_admin=False,  # not yet logged in
            referral_code="ALTAF",
            created_at=now_iso(),
        ).dict()
        await db.users.insert_one(canonical)

    # 2. Find every "legacy admin" row apart from the canonical one and rehab it.
    cursor = db.users.find({
        "user_id": {"$ne": ADMIN_USER_ID},
        "$or": [
            {"email": ADMIN_EMAIL},
            {"name": "Altaf (Admin)"},
            {"referral_code": "ALTAF"},
        ],
    }, {"_id": 0})
    async for legacy in cursor:
        device_id = (legacy.get("device_id") or "")[:10]
        suffix = (device_id or legacy["user_id"])[-4:].upper()
        new_name = f"User{suffix}"
        new_email = f"{(device_id or legacy['user_id'])[:10]}@device.local"
        # Fresh referral code so two users don't keep "ALTAF"
        new_code = await make_referral_code(new_name)
        await db.users.update_one(
            {"user_id": legacy["user_id"]},
            {"$set": {
                "name": new_name,
                "email": new_email,
                "referral_code": new_code,
                "is_admin": False,
                "admin_session_expires_at": None,
            }},
        )

    # 3. Re-point any sessions that were stuck pointing at a legacy admin row
    #    so that next request maps them back to their real device user.
    #    Sessions with `device_user_id` already remember the original; just
    #    swap user_id back. Sessions without device_user_id stay on whatever
    #    row they pointed at (now demoted to a normal user) — also fine.
    sessions = db.user_sessions.find(
        {"device_user_id": {"$exists": True, "$ne": None}}, {"_id": 0}
    )
    async for s in sessions:
        if s.get("device_user_id") and s.get("user_id") != s["device_user_id"]:
            await db.user_sessions.update_one(
                {"session_token": s["session_token"]},
                {"$set": {"user_id": s["device_user_id"]}, "$unset": {"device_user_id": ""}},
            )


async def migrate_wallet_split():
    """Split each existing user's single `points` balance into the new
    `campaign_points` and `games_task_points` buckets based on their
    transaction history. Idempotent — runs only on users that haven't
    been split yet (`campaign_points` AND `games_task_points` both 0
    while `points > 0`).
    """
    cursor = db.users.find({}, {"_id": 0})
    async for u in cursor:
        cp = int(u.get("campaign_points") or 0)
        gp = int(u.get("games_task_points") or 0)
        pts = int(u.get("points") or 0)
        if cp + gp == pts:
            continue  # already migrated / consistent
        # Compute lifetime campaign earnings from transaction log.
        camp_earned = 0
        gen_earned = 0
        withdrawn = 0
        async for t in db.transactions.find({"user_id": u["user_id"]}, {"_id": 0}):
            p = int(t.get("points") or 0)
            src = (t.get("source") or "").lower()
            if p > 0:
                if src == "campaign":
                    camp_earned += p
                else:
                    gen_earned += p
            else:
                withdrawn += -p
        # Allocate past withdrawals to games_task first (legacy withdraws
        # weren't tagged). Anything beyond that bleeds into campaign.
        gt_after = max(0, gen_earned - withdrawn)
        leftover = max(0, withdrawn - gen_earned)
        camp_after = max(0, camp_earned - leftover)
        # Clamp to current `points` so the two buckets always sum to it.
        total_after = gt_after + camp_after
        if total_after != pts and total_after > 0:
            # Scale proportionally to current balance.
            scale = pts / total_after
            gt_after = int(round(gt_after * scale))
            camp_after = pts - gt_after
        elif total_after == 0:
            gt_after = pts
            camp_after = 0
        await db.users.update_one(
            {"user_id": u["user_id"]},
            {"$set": {
                "campaign_points": camp_after,
                "games_task_points": gt_after,
            }},
        )


async def seed_initial_data():
    # Enforce "one device = one account" at the DB level.
    # partialFilterExpression so existing users without device_id (OAuth users) are unaffected.
    try:
        await db.users.create_index(
            "device_id",
            unique=True,
            partialFilterExpression={"device_id": {"$exists": True, "$type": "string"}},
            name="uniq_device_id",
        )
    except Exception as e:
        logging.warning(f"Could not create unique device_id index: {e}")

    # Anti-clone fingerprint index — speeds up the fallback lookup in
    # /api/auth/device when a cloning app supplies a fresh device_id.
    try:
        await db.users.create_index(
            "device_fingerprint",
            partialFilterExpression={"device_fingerprint": {"$exists": True, "$type": "string"}},
            name="idx_device_fingerprint",
        )
        await db.users.create_index("device_ids", name="idx_device_ids")
    except Exception as e:
        logging.warning(f"Could not create device_fingerprint/device_ids index: {e}")

    # Backfill new fields on existing docs (idempotent migration)
    await db.campaigns.update_many({"link_url": {"$exists": False}}, {"$set": {"link_url": ""}})
    await db.campaigns.update_many({"category": {"$exists": False}}, {"$set": {"category": "App Install"}})
    await db.campaigns.update_many({"difficulty": {"$exists": False}}, {"$set": {"difficulty": "Easy"}})
    await db.users.update_many({"total_withdrawn": {"$exists": False}}, {"$set": {"total_withdrawn": 0}})
    await db.users.update_many({"referred_by": {"$exists": False}}, {"$set": {"referred_by": None}})
    await db.users.update_many({"referral_rewards_paid": {"$exists": False}}, {"$set": {"referral_rewards_paid": []}})

    # Backfill referral_code for legacy users (one-by-one so we can resolve collisions)
    legacy_cursor = db.users.find(
        {"$or": [{"referral_code": {"$exists": False}}, {"referral_code": None}, {"referral_code": ""}]},
        {"_id": 0, "user_id": 1, "name": 1},
    )
    async for u in legacy_cursor:
        code = await make_referral_code(u.get("name") or "USER")
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"referral_code": code}})

    # Ensure referral_settings singleton exists
    if not await db.referral_settings.find_one({"_id": "singleton"}):
        await db.referral_settings.insert_one({"_id": "singleton", **ReferralSettings().dict()})

    await db.app_links.update_one(
        {"_id": "singleton", "telegram_contact": {"$exists": False}},
        {"$set": {"telegram_contact": ""}},
    )
    await db.app_links.update_one(
        {"_id": "singleton", "business_contact": {"$exists": False}},
        {"$set": {"business_contact": ""}},
    )

    # admin links
    if not await db.app_links.find_one({"_id": "singleton"}):
        await db.app_links.insert_one({
            "_id": "singleton",
            "telegram": "https://t.me/taskmint",
            "whatsapp": "https://whatsapp.com/channel/taskmint",
            "customer_support": "mailto:93altaff@gmail.com",
            "privacy_policy": "https://taskmint.app/privacy",
            "terms": "https://taskmint.app/terms",
            "telegram_contact": "",
            "business_contact": "",
        })
    # banners
    if await db.banners.count_documents({}) == 0:
        seed_banners = [
            Banner(title="Daily Bonus!", subtitle="Check in every day to earn bonus points", image_url="https://images.pexels.com/photos/7135024/pexels-photo-7135024.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940").dict(),
            Banner(title="Spin & Win", subtitle="10 free spins every day. Win up to 100 points!", image_url="https://images.unsplash.com/photo-1673200644249-bd8f6852a10c?crop=entropy&cs=srgb&fm=jpg&w=940&q=80").dict(),
            Banner(title="Refer & Earn ₹50", subtitle="Invite friends and earn together", image_url="https://images.unsplash.com/photo-1671749999622-4087a86868cc?crop=entropy&cs=srgb&fm=jpg&w=940&q=80").dict(),
        ]
        await db.banners.insert_many(seed_banners)
    # campaigns
    if await db.campaigns.count_documents({}) == 0:
        seed_camps = [
            Campaign(name="PhonePe", note="Install & open the app", logo_url="https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=200&h=200&fit=crop", reward_points=2500, reward_inr=25).dict(),
            Campaign(name="Groww", note="Sign up and complete KYC", logo_url="https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=200&h=200&fit=crop", reward_points=8000, reward_inr=80).dict(),
            Campaign(name="Dream11", note="Install + first deposit", logo_url="https://images.unsplash.com/photo-1551958219-acbc608c6377?w=200&h=200&fit=crop", reward_points=5000, reward_inr=50).dict(),
            Campaign(name="Cred", note="Complete profile setup", logo_url="https://images.unsplash.com/photo-1556745753-b2904692b3cd?w=200&h=200&fit=crop", reward_points=3000, reward_inr=30).dict(),
            Campaign(name="MX Player", note="Watch any video for 2 mins", logo_url="https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=200&h=200&fit=crop", reward_points=1500, reward_inr=15).dict(),
        ]
        await db.campaigns.insert_many(seed_camps)


# ============================================================
# GAMES — Higher-or-Lower
# ============================================================

def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _month_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


_GAME_SETTINGS_DEFAULTS = {
    "hl_daily_rounds": 10,
    "hl_ad_refills_max": 10,
    "hl_reward_streak_3": 30,
    "hl_reward_streak_5": 75,
    "hl_reward_streak_7": 100,
    "watch_cycle_limit": 5,
    "watch_cycle_hours": 6,
    "watch_reward_min": 50,
    "watch_reward_max": 100,
}


async def get_game_settings() -> dict:
    doc = await db.game_settings.find_one({"_id": "settings"}) or {}
    return {**_GAME_SETTINGS_DEFAULTS, **{k: v for k, v in doc.items() if k != "_id"}}


# -------- Higher-or-Lower --------
HL_DAILY_ROUNDS = 10
HL_AD_REFILLS_MAX = 10


def _hl_today_counts(user: dict) -> tuple[int, int]:
    today = _today_str()
    if user.get("hl_date") != today:
        return 0, 0
    return int(user.get("hl_rounds_used") or 0), int(user.get("hl_ad_refills_used") or 0)


def _hl_streak_reward(streak: int, settings: dict, meta: dict | None = None) -> int:
    """Return the points awarded for a Higher-Lower streak.

    Source of truth (in priority order):
      1. `app_settings.meta.hl_reward_streak_{3,5,7}` — controlled by Admin → App Config.
      2. Legacy `game_settings.hl_reward_streak_{3,5,7}` — kept for back-compat.
      3. Hard-coded defaults (30 / 75 / 100).
    """
    meta = meta or {}

    def _val(meta_key: str, legacy_key: str, default: int) -> int:
        if meta_key in meta and meta[meta_key] is not None:
            try:
                return int(meta[meta_key])
            except (TypeError, ValueError):
                pass
        return int(settings.get(legacy_key, default))

    if streak >= 7:
        return _val("hl_reward_streak_7", "hl_reward_streak_7", 100)
    if streak >= 5:
        return _val("hl_reward_streak_5", "hl_reward_streak_5", 75)
    if streak >= 3:
        return _val("hl_reward_streak_3", "hl_reward_streak_3", 30)
    return 0


@api_router.get("/games/hl/state")
async def hl_state(user: dict = Depends(get_current_user)):
    settings = await get_game_settings()
    used, ad_refills = _hl_today_counts(user)
    active = user.get("hl_active") or None
    if active and active.get("date") != _today_str():
        active = None
    return {
        "rounds_used": used,
        "rounds_total": -1,
        "ad_refills_used": ad_refills,
        "ad_refills_max": -1,
        "active": active,
    }


class HLStartBody(BaseModel):
    ad_refill: bool = False


@api_router.post("/games/hl/start")
async def hl_start(payload: HLStartBody, user: dict = Depends(get_current_user)):
    settings = await get_game_settings()
    today = _today_str()
    used, ad_refills = _hl_today_counts(user)
    # Per spec: no daily limit. Frontend handles 10-chances-per-rewarded-ad gating.
    used += 1

    card = random.randint(1, 13)
    active = {
        "date": today,
        "current_card": card,
        "streak": 0,
    }
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "hl_date": today,
            "hl_rounds_used": used,
            "hl_ad_refills_used": ad_refills,
            "hl_active": active,
        }},
    )
    return {
        "card": card,
        "streak": 0,
        "rounds_used": used,
        "rounds_total": -1,
        "ad_refills_used": ad_refills,
        "ad_refills_max": -1,
    }


class HLGuessBody(BaseModel):
    guess: Literal["higher", "lower"]


@api_router.post("/games/hl/guess")
async def hl_guess(payload: HLGuessBody, user: dict = Depends(get_current_user)):
    settings = await get_game_settings()
    meta = await get_app_meta()
    active = user.get("hl_active")
    if not active or active.get("date") != _today_str():
        raise HTTPException(status_code=400, detail="No active round — start a new one")
    current = int(active.get("current_card") or 0)
    streak = int(active.get("streak") or 0)

    # Draw next card different from current to avoid ties (re-roll on tie up to 3 times)
    nxt = random.randint(1, 13)
    tries = 0
    while nxt == current and tries < 3:
        nxt = random.randint(1, 13)
        tries += 1

    correct = (
        (payload.guess == "higher" and nxt > current)
        or (payload.guess == "lower" and nxt < current)
        or (nxt == current)  # tie counts as correct (free pass)
    )

    if correct:
        streak += 1
        active = {"date": _today_str(), "current_card": nxt, "streak": streak}
        await db.users.update_one(
            {"user_id": user["user_id"]}, {"$set": {"hl_active": active}}
        )
        return {
            "card": nxt,
            "prev_card": current,
            "correct": True,
            "streak": streak,
            "potential_reward": _hl_streak_reward(streak, settings, meta),
            "round_over": False,
        }

    # Wrong — end round, award based on streak achieved
    reward = _hl_streak_reward(streak, settings, meta)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"hl_active": None}})
    if reward > 0:
        await add_points_and_log(user["user_id"], reward, "higher_lower", f"H/L streak {streak}")
    return {
        "card": nxt,
        "prev_card": current,
        "correct": False,
        "streak": streak,
        "reward": reward,
        "round_over": True,
    }


@api_router.post("/games/hl/cashout")
async def hl_cashout(user: dict = Depends(get_current_user)):
    settings = await get_game_settings()
    meta = await get_app_meta()
    active = user.get("hl_active")
    if not active or active.get("date") != _today_str():
        raise HTTPException(status_code=400, detail="No active round")
    streak = int(active.get("streak") or 0)
    reward = _hl_streak_reward(streak, settings, meta)
    if reward <= 0:
        raise HTTPException(status_code=400, detail="Need at least 3 correct to cash out")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"hl_active": None}})
    await add_points_and_log(user["user_id"], reward, "higher_lower", f"H/L cashout streak {streak}")
    return {"reward": reward, "streak": streak}


# -------- Memory Match --------
class MemoryPlayBody(BaseModel):
    moves: int
    time_seconds: int
    completed: bool

@api_router.get("/games/memory/state")
async def memory_state(user: dict = Depends(get_current_user)):
    return {"plays_used": 0, "plays_total": -1, "remaining": -1}

@api_router.post("/games/memory/play")
async def memory_play(payload: MemoryPlayBody, user: dict = Depends(get_current_user)):
    if not payload.completed:
        return {"reward": 0, "remaining": -1}
    # Admin-configurable completion reward (default 200).
    meta = await get_app_meta()
    reward = int(meta.get("memory_completion", 200) or 200)
    await add_points_and_log(user["user_id"], reward, "memory", f"Memory match: {int(payload.moves or 0)} moves, {int(payload.time_seconds or 0)}s")
    return {"reward": reward, "remaining": -1}


# -------- Tic-Tac-Toe --------
class TicTacToePlayBody(BaseModel):
    result: Literal["win", "draw", "loss"]
    difficulty: Literal["easy", "medium", "hard"]

@api_router.get("/games/tictactoe/state")
async def tictactoe_state(user: dict = Depends(get_current_user)):
    return {"plays_used": 0, "plays_total": -1, "remaining": -1}

@api_router.post("/games/tictactoe/play")
async def tictactoe_play(payload: TicTacToePlayBody, user: dict = Depends(get_current_user)):
    meta = await get_app_meta()
    # Admin sets the "hard win" payout, easy/medium scale to 30% / 60%.
    base_win = int(meta.get("ttt_win", 100) or 100)
    rewards = {
        "easy":   {"win": int(base_win * 0.3), "draw": int(base_win * 0.1), "loss": 0},
        "medium": {"win": int(base_win * 0.6), "draw": int(base_win * 0.2), "loss": 0},
        "hard":   {"win": base_win,            "draw": int(base_win * 0.3), "loss": 0},
    }
    reward = rewards[payload.difficulty][payload.result]
    if reward > 0:
        await add_points_and_log(
            user["user_id"], reward, "tictactoe",
            f"TTT {payload.difficulty} {payload.result}",
        )
    return {"reward": reward, "remaining": -1}


# -------- Math Sprint --------
class MathPlayBody(BaseModel):
    correct: int
    total: int
    time_seconds: int

@api_router.get("/games/math/state")
async def math_state(user: dict = Depends(get_current_user)):
    return {"plays_used": 0, "plays_total": -1, "remaining": -1}

@api_router.post("/games/math/play")
async def math_play(payload: MathPlayBody, user: dict = Depends(get_current_user)):
    correct = max(0, int(payload.correct or 0))
    # Admin-configurable: points per correct answer.
    meta = await get_app_meta()
    per_correct = int(meta.get("math_per_correct", 5) or 5)
    reward = correct * per_correct
    if reward > 0:
        await add_points_and_log(user["user_id"], reward, "math", f"Math Sprint {correct}/{payload.total}")
    return {"reward": reward, "remaining": -1}


# -------- Daily Challenge (mystery box) --------
@api_router.get("/games/daily-challenge/state")
async def daily_challenge_state(user: dict = Depends(get_current_user)):
    today = today_str()
    claimed = user.get("daily_challenge_date") == today
    return {"claimed_today": claimed, "available_boxes": 4 if not claimed else 0}

@api_router.post("/games/daily-challenge/open")
async def daily_challenge_open(user: dict = Depends(get_current_user)):
    today = today_str()
    if user.get("daily_challenge_date") == today:
        raise HTTPException(status_code=400, detail="Already opened today — come back tomorrow")
    # Weighted reward — values configurable via Admin → Game Rewards.
    meta = await get_app_meta()
    common = int(meta.get("daily_challenge_common", 50) or 50)
    uncommon = int(meta.get("daily_challenge_uncommon", 150) or 150)
    rare = int(meta.get("daily_challenge_rare", 300) or 300)
    jackpot = int(meta.get("daily_challenge_jackpot", 1000) or 1000)
    r = random.random()
    if r < 0.01:    reward = jackpot   # 1% jackpot
    elif r < 0.10:  reward = rare      # 9%
    elif r < 0.50:  reward = uncommon  # 40%
    else:           reward = common    # 50%
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"daily_challenge_date": today}},
    )
    await add_points_and_log(user["user_id"], reward, "daily_challenge", "Daily mystery box")
    return {"reward": reward, "jackpot": reward >= jackpot}


# -------- Tap-the-Coin Rush --------
class TapPlayBody(BaseModel):
    gold: int = 0
    silver: int = 0
    bombs_hit: int = 0
    diamond: int = 0
    duration_seconds: int = 30

@api_router.get("/games/tap/state")
async def tap_state(user: dict = Depends(get_current_user)):
    return {"plays_used": 0, "plays_total": -1, "remaining": -1}

@api_router.post("/games/tap/play")
async def tap_play(payload: TapPlayBody, user: dict = Depends(get_current_user)):
    diamond = max(0, int(payload.diamond or 0))
    gold = max(0, int(payload.gold or 0))
    silver = max(0, int(payload.silver or 0))
    bombs = max(0, int(payload.bombs_hit or 0))
    meta = await get_app_meta()
    # Admin-configurable per-item payouts:
    #   diamond +3 (rare), gold +2 (rare), silver +1, bomb penalty -5
    per_diamond = int(meta.get("tap_per_diamond", 3) or 0)
    per_gold = int(meta.get("tap_per_gold", 2) or 0)
    per_silver = int(meta.get("tap_per_silver", 1) or 0)
    bomb_penalty = int(meta.get("tap_bomb_penalty", 5) or 0)
    raw = (diamond * per_diamond) + (gold * per_gold) + (silver * per_silver) - (bombs * bomb_penalty)
    reward = max(0, raw)
    if reward > 0:
        await add_points_and_log(
            user["user_id"], reward, "tap_rush",
            f"Tap Rush diamond={diamond} gold={gold} silver={silver} bombs={bombs}",
        )
    return {"reward": reward, "remaining": -1}


# -------- Trivia Streak --------
class TriviaPlayBody(BaseModel):
    correct: int = 0
    total: int = 0
    max_streak: int = 0

@api_router.get("/games/trivia/state")
async def trivia_state(user: dict = Depends(get_current_user)):
    return {"plays_used": 0, "plays_total": -1, "remaining": -1}

@api_router.post("/games/trivia/play")
async def trivia_play(payload: TriviaPlayBody, user: dict = Depends(get_current_user)):
    correct = max(0, int(payload.correct or 0))
    max_streak = max(0, int(payload.max_streak or 0))
    meta = await get_app_meta()
    # Admin-configurable: points per correct + streak bonus per step above 1.
    per_correct = int(meta.get("trivia_per_correct", 8) or 0)
    streak_bonus = int(meta.get("trivia_streak_bonus", 5) or 0)
    base = correct * per_correct
    bonus = max(0, max_streak - 1) * streak_bonus
    reward = base + bonus
    if reward > 0:
        await add_points_and_log(
            user["user_id"], reward, "trivia",
            f"Trivia Streak correct={correct} max_streak={max_streak}",
        )
    return {"reward": reward, "max_streak": max_streak, "remaining": -1}


# -------- Admin: Game Settings --------







@app.on_event("startup")
async def startup_event():
    await migrate_duplicate_admins()
    await migrate_wallet_split()
    await seed_initial_data()


# Include the router
app.include_router(api_router)

_cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
