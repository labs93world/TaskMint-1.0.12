#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Task earning app with hidden admin. Device-ID one-tap login (no logout for users).
  Hidden admin login on Profile (email/password). Offerwall with custom 2-field form
  + admin Approve/Reject (with reason)/Reset (with reason). Earn tab (Spin, Scratch,
  Watch & Earn, Visit & Earn, Daily Check-in). Wallet with UPI/Bank withdrawals.
  Admin can: search users, alter points (with reason), permanently delete users,
  approve/reject withdrawals (reject with reason), manage offerwall tasks (with logo
  upload), manage app links. AdMob (Banner / Interstitial / Rewarded).

backend:
  - task: "Permanently delete user (admin)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "DELETE /api/admin/users/{user_id} cascades sessions, transactions, completions, withdrawals. Refuses self-delete."
      - working: true
        agent: "testing"
        comment: |
          Verified end-to-end via /app/backend_test.py:
          * DELETE /api/admin/users/{user_id} -> 200 with {ok:true, deleted_user_id}.
          * DELETE on admin's own user_id -> 400 "Cannot delete yourself".
          * GET /api/admin/users/{id} after delete -> 404. User is no longer in /api/admin/users list.
          * Cascade verified: transactions, withdrawals, and campaign_completions for the user are all gone (counts = 0). The deleted user's session_token is rejected with 401 on /api/auth/me.

  - task: "Reject withdrawal with admin_note"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "PUT /api/admin/withdrawals/{id} accepts {status,admin_note}. On rejection, points are refunded to user and a transaction logged."
      - working: true
        agent: "testing"
        comment: |
          Verified via /app/backend_test.py:
          * PUT /api/admin/withdrawals/{id} with {status:"rejected", admin_note:"Test reason"} -> 200, record updated (status=rejected, admin_note saved).
          * Points refunded: balance went from 10000 -> 10100 (= +pts1) after rejection. A refund transaction is logged with source="withdraw" and positive points and note "Withdrawal {id} refunded".
          * Approve path: PUT with {status:"successful", admin_note:"OK"} on a 2nd 10000-pt withdrawal -> points NOT refunded (balance unchanged at 100).

  - task: "Watch & Earn task endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/tasks/watch grants 20-50 pts, daily limit 5, increments daily_watches_used, logs transaction."
      - working: false
        agent: "testing"
        comment: |
          The endpoint mostly works but does NOT match the spec on the daily limit, and there is a related correctness bug.
          BUG #1 (spec mismatch): server uses limit 20, task description said 5.
          BUG #2 (date roll-over): `reset_daily_limits_if_needed()` did NOT reset `daily_watches_used` — user permanently locked out after first limit-day.
      - working: true
        agent: "main"
        comment: "Fixed BUG #2 by adding `daily_watches_used: 0` to the $set in reset_daily_limits_if_needed. Re: BUG #1 — daily limit kept at 20 (spec text '20-50 pts per video' refers to reward range, not count). Asked tester to update expectation to 20."
      - working: true
        agent: "testing"
        comment: |
          Re-tested POST /api/tasks/watch with updated spec (daily limit = 20). All 6 assertions PASS:
          * 20 successful POST /api/tasks/watch calls, each returning {"reward": <int 20-50>, "remaining": <int>} (remaining counter present and decrementing 19..0).
          * 21st call same day -> 400 {"detail":"Daily watch limit reached"}.
          * User points & total_earned both incremented by sum of rewards (delta=710 for 20 calls).
          * 20 transactions logged with source="watch" in /api/wallet/transactions.
          * Code path for date roll-over confirmed in /app/backend/server.py line 248: reset_daily_limits_if_needed now includes `"daily_watches_used": 0` in the $set block alongside spins/scratches, and also resets it on the in-memory user dict (line 254). Endpoint is correct per the (now-aligned) spec.

  - task: "Campaign completion review (Approve/Reject/Reset)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/admin/campaign-completions/{id}/review with status approved|rejected and admin_note. Approve credits points; reject saves note; user can re-attempt task only after admin removes the prior completion (reset path)."
      - working: true
        agent: "testing"
        comment: |
          NOTE: actual endpoint shape differs from review wording (review said POST .../review). Implementation uses PUT /api/admin/campaign-completions/{id} with {status, admin_note} and DELETE /api/admin/campaign-completions/{id} for reset. Tested actual implementation:
          * Admin POST /api/admin/campaigns with reward_points=500 -> 200 returns campaign with id.
          * User POST /api/tasks/campaign/{id} -> 200 returns {link_url}.
          * User POST /api/tasks/campaign/{id}/submit with form_field_1_value/form_field_2_value -> 200, {status:"pending"}.
          * Completion appears in GET /api/admin/campaign-completions as pending.
          * Approve: PUT .../{id} {status:"approved", admin_note:"good"} -> 200, user points increase by exactly campaign.reward_points (delta=500).
          * Reject (2nd user): PUT .../{id} {status:"rejected", admin_note:"low quality"} -> 200, completion stored with status=rejected & note saved, NO points credited.
          * Reset: DELETE .../{id} -> 200 {ok:true}, then user can submit the same campaign again successfully (status=pending).
          Minor spec-naming difference only; functionality is correct.

  - task: "App links includes business_contact"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added business_contact migration in seed_initial_data; /api/links now returns it (verified)."

  - task: "No automatic withdrawal history on campaign approval"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "user"
        comment: "User clarified: when admin approves a task, do NOT create automatic withdrawal history."
      - working: true
        agent: "main"
        comment: "Removed automatic withdrawal/ledger creation from all campaign approval paths. Full, partial, and zero-point approvals now only apply the approved points. Targeted suites: 12/12 PASS."

frontend:
  - task: "Profile - Quick Access text rows with Contact for Business"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Reverted to original text-row Quick Access. Order: Telegram, Contact on Telegram, Contact for Business (Briefcase icon, sub=business_contact), Privacy, Terms. URLs visible in subtitles."
      - working: true
        agent: "testing"
        comment: |
          PASS. Profile -> Quick Access shows 5 text rows in correct order with icons + chevrons:
          Telegram Channel, Contact on Telegram, Contact for Business (Briefcase), Privacy Policy, Terms & Conditions.
          All 5 testIDs (qa-telegram, qa-telegram-contact, qa-business, qa-privacy, qa-terms) present.
          "Customer Support" text NOT present anywhere on Profile tab. URLs render as subtitles for the
          first three rows. After admin saved business_contact = "mailto:business@taskmint.com", the
          Contact for Business subtitle on Profile updated to that value.

  - task: "Admin Channel Links - business_contact field replaces customer_support"
    implemented: true
    working: true
    file: "/app/frontend/app/admin/links.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Removed customer_support input. Added business_contact input ('Contact for Business (URL or mailto:)'). Saves via PUT /api/admin/links."
      - working: true
        agent: "testing"
        comment: |
          PASS. /admin/links shows exactly 5 inputs with correct labels: Telegram Channel,
          Contact on Telegram, Contact for Business (URL or mailto:), Privacy Policy URL,
          Terms & Conditions URL. No "Customer Support" input exists (link-customer_support count=0).
          Save flow works: PUT /api/admin/links -> 200; new business_contact value persists and is
          reflected back on Profile tab.

  - task: "Withdrawal history shows rejection reason"
    implemented: true
    working: true
    file: "/app/frontend/app/withdraw.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "When a withdrawal status=rejected and admin_note is non-empty, a red Reason: ... pill is rendered under the bank/UPI line. Pulls from GET /api/withdraw/history."
      - working: true
        agent: "testing"
        comment: |
          PASS. Seeded a fresh device user with 20,000 pts via admin /adjust-points, submitted a
          UPI withdrawal of 100 pts, rejected via admin PUT /api/admin/withdrawals/{id}
          {status:'rejected', admin_note:'Wrong UPI ID'}. After switching FE token to the user and
          opening /withdraw, "Withdrawal History" section shows the rejected row with REJECTED chip
          and a red pill "Reason: Wrong UPI ID" rendered below the bank/UPI line.

  - task: "Offerwall cards show rejection/reset reason"
    implemented: true
    working: true
    file: "/app/frontend/app/offers.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "When a campaign completion status=rejected with admin_note (also covers admin Reset-with-reason path until user re-submits), the rejection reason renders below the status chip. Pulls from GET /api/campaign-completions."
      - working: true
        agent: "testing"
        comment: |
          PASS. Created an admin campaign, user started + submitted (form_field_1/2), admin
          PUT /api/admin/campaign-completions/{id} {status:'rejected', admin_note:'Invalid screenshot'}.
          After user reload of /offers, the campaign card shows the "Rejected" status chip and the
          red "Reason: Invalid screenshot" line directly below it.

  - task: "Profile - icon-only Quick Access grid (no URLs)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Replaced text rows with 3-col icon tiles: Telegram, Contact, Business, Privacy, Terms. URLs hidden — taps open links."

  - task: "Earn tab - Visit & Earn icon"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/earn.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Switched icon from PlayCircle to Globe (cyan) so Visit & Earn is visually distinct from Watch & Earn."

  - task: "Admin Users - Permanently delete user"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/admin/users.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Trash button in user detail modal calls DELETE /api/admin/users/{user_id} after confirm."

  - task: "Withdraw amount chips reflect per-user overrides"
    implemented: true
    working: true
    file: "/app/frontend/app/withdraw.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "user"
        comment: "User reported: amount chips are not visible after an admin per-user override."
      - working: "NA"
        agent: "main"
        comment: "Withdraw screen now fetches /auth/me on every focus and applies fresh custom_withdraw_amounts/custom_exchange_ratio instead of relying on stale AuthContext state; first-withdrawal chip filtering also uses the fresh record."
      - working: true
        agent: "testing"
        comment: "PASS on mobile viewport with a real fresh device user. Override ratio=500 and chips=[100,500,1000] applied mid-session; Wallet -> Withdraw shows override chips ₹0/₹1/₹2 without stale global chips. With has_first_withdrawal=true, the 100-point first chip hides while 500/1000 remain."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 4
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Implemented final iteration polish: (1) Admin can permanently delete a user
      (cascade delete). (2) Admin can reject withdrawals with a reason; rejection
      refunds the points. (3) Watch & Earn endpoint exists and is wired to UI.
      (4) Campaign review (approve/reject/reset) flow on backend is in place.
      Frontend: profile shows an icon-only Quick Access grid with Business contact;
      Visit & Earn now uses a Globe icon. Please run backend tests against the four
      "current_focus" tasks. Admin creds + device login are in /app/memory/test_credentials.md.
  - agent: "testing"
    message: |
      Ran /app/backend_test.py against the public REACT_APP_BACKEND_URL.
      33 of 34 assertions PASS. Smoke checks (/api/links contains business_contact,
      /api/auth/me, /api/auth/admin-login bad password -> 401) all pass.

      PASSING tasks:
      - Permanently delete user (admin): cascade delete + self-delete refusal verified.
      - Reject withdrawal with admin_note: reject refunds points and logs txn; approve does NOT refund.
      - Campaign completion review (Approve/Reject/Reset): admin create campaign, user submit,
        admin PUT approve credits exact reward_points, PUT reject saves note with no credit,
        DELETE reset lets user re-submit.

      FAILING task — Watch & Earn endpoint:
        BUG #1: Daily limit is 20 in code but spec/main agent description said 5.
        BUG #2: `reset_daily_limits_if_needed` does NOT reset `daily_watches_used` — locks user out forever.
  - agent: "testing"
    message: |
      Frontend UI verification (mobile viewport 390x844) for the 4 user-visible changes — ALL PASS.
      1) Profile -> Quick Access shows the 5 text rows in correct order with subtitles for the
         first three (Telegram, Telegram contact, Business). "Customer Support" is gone.
      2) /admin/links shows 5 inputs with correct labels including "Contact for Business
         (URL or mailto:)"; saving via PUT /api/admin/links works (200) and the new value is
         reflected on Profile.
      3) After admin rejects a UPI withdrawal with reason "Wrong UPI ID", the user's
         Withdrawal History row renders the red "Reason: Wrong UPI ID" pill.
      4) After admin rejects a campaign completion with reason "Invalid screenshot",
         the user's /offers card shows the "Rejected" status chip and red
         "Reason: Invalid screenshot" line below it.
      Setup notes: created admin (fresh device + /api/auth/admin-login) and a separate device
      user via /api/auth/device, seeded points via /api/admin/users/{id}/adjust-points. To avoid
      the cookie session_token from /api/auth/device overriding the admin's cookie session, all
      API calls used credentials:'omit' and Bearer tokens; in the browser, cookies were cleared
      before switching FE between admin/user views. No console errors observed.

  - agent: "testing"
    message: |
      Re-ran ONLY the Watch & Earn test (POST /api/tasks/watch) per main agent's request.
      Spec updated: daily limit = 20 (the "20-50" in UI is reward range, not count).
      ALL 6 ASSERTIONS PASS:
        * 20 successful calls return reward in [20,50] + remaining counter (19..0).
        * 21st call same day -> 400 "Daily watch limit reached".
        * Points & total_earned increased by sum(rewards)=710.
        * 20 transactions logged with source="watch".
        * Verified date roll-over fix in code: server.py line 248 now sets
          `"daily_watches_used": 0` inside reset_daily_limits_if_needed alongside
          spins/scratches, plus updates the in-memory user dict (line 254).
      Watch & Earn endpoint is now fully working. No remaining backend issues from current_focus.

  - agent: "main"
    message: |
      User reported two final blockers: per-user withdraw amount chips not visible after override, and automatic withdrawal history creation. The override-chip fix remains valid. The initial automatic-history interpretation below was superseded by the user's immediate clarification: do not create withdrawal history on campaign approval.

  - agent: "main"
    message: |
      User correction received after iteration 34: campaign approval must NEVER create automatic withdrawal history. Removed the auto withdrawal and ledger creation from the approval endpoint for full, partial, and zero-point approvals. Updated both targeted suites accordingly; 12/12 PASS.
      The override-chip fix remains in place and verified: Withdraw fetches fresh /auth/me on focus and applies custom chips/ratio.

## Iteration 27 (fork agent) — Comprehensive backend regression + CRITICAL fix
- Ran full backend regression (42/42 pass) across auth, tasks/games earn+claim, referrals, wallet/withdraw, campaigns, admin.
- CRITICAL BUG FIXED in server.py admin_update_withdraw (~line 1927):
  1. status compared to "paid" but WithdrawUpdate Literal only allows pending|successful|rejected → referral withdrawal-mode bonus NEVER paid. Fixed "paid" → "successful" (2 places).
  2. referrer looked up by referral_code but referred_by stores a user_id → referrer never found. Fixed to look up by user_id.
- Verified: syntax OK, backend restarts clean, /api/version returns 1.0.1.
- Build config verified deployment-ready: AdMob Kotlin 2.1.0, react-native-google-mobile-ads 16.3.4, yarn.lock (concat-map/brace-expansion) intact, requirements.txt clean, app.json name/package/version=1.0.1.

## Phase 1 (fork agent) — Single wallet + layout + exchange ratio + surveys
Backend (server.py):
- Single-wallet /withdraw: balance/min checks now use user.points + meta.min_withdrawal (added field). Deducts points (+games_task_points kept in sync). Removed per-source picker logic. Reject-refund → points.
- /campaigns and /campaign/{id} now compute reward_inr live from exchange_points_per_inr (App Config) — item 1a.
- /withdraw-settings returns single min_withdrawal.
Frontend:
- withdraw.tsx rewritten: no wallet picker, single BALANCE, single min. (items 4a, 3d)
- wallet.tsx: removed category filters (3c), tightened gaps (3a,3b vertical).
- profile.tsx: removed stats row + notifications section (2a).
- home.tsx: tightened section gaps.
- task/[id].tsx: vertical optimize (smaller card padding/logo/gaps) (5).
- surveys.tsx: 1 survey per task (limit=1) (6i).
Note: quizzes already return 5 distinct random Qs from 25-pool (6j OK).
Pending Phase 2: per-game ad gating (6a-h), admin ad config (1b), AutoSizeText (7), splash both-appear+fast (8).

## Phase 2 (fork agent) — Per-game ad gating + admin ad config
Backend: added AppMetaSettings.game_ad_config (per-game ad_type/chances_per_ad/every_n) with spec defaults; exposed via /app-config; editable via existing PUT /admin/app-config.
Frontend:
- New hook src/hooks/useGameAdConfig.ts (fetches /app-config, spec defaults).
- Wired HL(6b, every 2), TTT(6d, every 2), Math(6e, every 2), Memory(6c, rewarded chances=1), Tap(6g, every 1), Trivia(6h, every 1) via useGameSession(cfg.chances_per_ad, cfg.every_n).
- Checkin(6a): interstitial shown on claim before reward card.
- Daily Challenge(6f): swapped interstitial->rewarded on box open.
- Survey(6i): already interstitial on submit.
- New admin screen /admin/game-ads + tile in admin index (item 1b).
Pending Phase 3: 6k full live reward labels across all games; item 7 AutoSizeText everywhere; item 8 splash (both already appear, no artificial delay).

## Phase 2 follow-ups (fork agent)
- Fixed memory chances denominator to use adCfg.chances_per_ad (was hardcoded /5).
- checkin & daily-challenge now honor admin-selected ad_type (interstitial vs rewarded) — full 1b consistency.
- Item 6k live reward labels: memory (memory_completion), tic-tac-toe (ttt_win scaled), trivia (per_correct/streak_bonus), quizzes (quiz_min/max), checkin (base/cap). HL already dynamic.
- Item 7: added reusable src/components/AutoText.tsx (adjustsFontSizeToFit wrapper); applied to BalanceCard. Broader rollout available.
- Item 8: native splash + JS loading both appear in sequence; splash hides right after auth token check (no artificial delay) = fast open.
Verified: lint clean on all changed files; memory-match smoke shows rewarded gating + dynamic chances 0/1 + dynamic reward label.

## Force-update gate re-wire fixes (fork agent, post iter31)
- Bug1 (gate always showed on web): installed version resolved to "0.0.0" because Constants.expoConfig.version empty on web. Fix in app/_layout.tsx UpdateGateHost: `installed = Application.nativeApplicationVersion || appJson.expo.version || Constants.expoConfig?.version || "0.0.0"` (import ../app.json). Verified via screenshot: latest=installed=1.0.1 -> NO gate (welcome screen shows).
- Bug2 (admin escape from gate): UpdateGate.submitAdmin now router.push("/admin") (mirrors working Profile flow) instead of "/admin/settings" which bounced.
- Native build reads real version via expo-application; force ON => hard block (no Skip), force OFF+outdated => dismissible.

## Big batch (fork agent) — Home/Earn/Wallet/Admin
Backend: added Campaign.cta_label; AppMetaSettings home_default_tab/home_tab_order; user custom_exchange_ratio/custom_withdraw_amounts (setdefault); /withdraw uses per-user ratio; admin_update_completion persists credited_points; reset endpoint now DELETES completion + deducts if approved; new PUT /admin/users/{id}/overrides.
Frontend:
- Earn labels removed/reformatted (daily/HL/memory/math/trivia); tap-coins vertical list + watch 2-line, all from admin config; daily jackpot text hard-set 50000; NativeAd card removed (expands).
- Home: ₹-only rewards; admin-controlled tab order + default (reads /app-config).
- Task detail: CTA button label from campaign.cta_label.
- Admin campaigns: CTA label input. Admin completions: Reset (with reason) for approved/rejected. Admin settings: Home tabs section. Admin users: per-user override (ratio + chips).
- Wallet: mandatory mobile popup on Withdraw (if no mobile); withdraw screen mobile field removed; withdraw uses per-user chips/ratio.
