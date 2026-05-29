# ASCEND Project Memory

## Purpose

ASCEND is a gamified personal evolution system built as a mobile-first Next.js app with Supabase. The product frames self-improvement as a "hunter system" with ranks, levels, stats, daily quests, 21-day cycles, penalties for weak days, and web push notifications.

This file is the persistent handoff for future AI contributors. Update it whenever the app's behavior, architecture, schema, workflow, or deployment assumptions change.

## Stack

- Framework: Next.js `16.2.6` with App Router
- React: `19.2.4`
- Language: TypeScript, strict mode
- Styling: Tailwind CSS v4 via `@import "tailwindcss"` and `@theme` tokens in [`app/globals.css`](/C:/Users/Aditya/project/ascend/app/globals.css)
- Auth/data/backend: Supabase
- Notifications: Web Push via service worker + Supabase Edge Functions
- Deployment target: Vercel, with a cron hitting `/api/cron/daily-reset`

## Important repo rules

- Read Next docs under `node_modules/next/dist/docs/` before making framework-level changes. The local `AGENTS.md` explicitly warns that this project is on a newer/breaking version of Next.
- Keep this `memory.md` updated whenever meaningful changes are made.
- The worktree may be dirty. Do not revert unrelated user changes.

## Product model

The user is a "hunter" progressing through a themed self-improvement system.

Core concepts:

- Onboarding assigns an archetype based on self-reported struggle + failure pattern.
- A user gets baseline stats from that archetype.
- The user selects a 21-day quest loadout from quest pools.
- Daily quests are generated from the active selections.
- Completing quests grants XP and stat increases.
- Levels determine rank. Rank E starts at level 6.
- Elite quests unlock at level 6+.
- A streak is only maintained if the user hits a cycle-specific Kaizen threshold.
- Weak days and failed days trigger escalating penalties.

## Main user flow

### 1. Authentication

- `/auth/login` and `/auth/signup` are client pages that call server actions in [`app/actions/auth.ts`](/C:/Users/Aditya/project/ascend/app/actions/auth.ts).
- Supabase auth is used for sign-in/sign-up/sign-out.
- A DB trigger auto-creates a `users` row on auth signup; onboarding later fills in the rest.

### 2. Root routing

- `/` checks auth and whether `users.hunter_name` exists.
- Redirect rules:
  - no auth -> `/auth/login`
  - auth but not onboarded -> `/onboarding`
  - auth and onboarded -> `/dashboard`

This logic exists both in [`app/page.tsx`](/C:/Users/Aditya/project/ascend/app/page.tsx) and in the auth guard proxy in [`proxy.ts`](/C:/Users/Aditya/project/ascend/proxy.ts).

### 3. Onboarding

File: [`app/onboarding/page.tsx`](/C:/Users/Aditya/project/ascend/app/onboarding/page.tsx)

Steps:

- splash intro
- choose biggest struggle
- choose 6-month winning vision
- choose what kills progress
- 3-second archetype processing screen
- archetype reveal
- choose hunter name + write commitment/oath
- request notification permission
- reveal baseline stats
- submit to `completeOnboarding`

Server action: [`app/actions/onboarding.ts`](/C:/Users/Aditya/project/ascend/app/actions/onboarding.ts)

On completion it:

- derives archetype with `assignArchetype`
- derives baseline stats with `getBaselineStats`
- upserts `users`
- upserts `stats`
- redirects to `/dashboard`

### 4. Protected app shell

Protected pages live under [`app/(protected)`](/C:/Users/Aditya/project/ascend/app/(protected)).

Routes:

- `/dashboard`
- `/stats`
- `/profile`

Protected layout: [`app/(protected)/layout.tsx`](/C:/Users/Aditya/project/ascend/app/(protected)/layout.tsx)

- wraps content
- adds fixed bottom nav via [`app/components/BottomNav.tsx`](/C:/Users/Aditya/project/ascend/app/components/BottomNav.tsx)

## Dashboard behavior

Primary server route: [`app/(protected)/dashboard/page.tsx`](/C:/Users/Aditya/project/ascend/app/(protected)/dashboard/page.tsx)

Primary client UI: [`app/components/DashboardClient.tsx`](/C:/Users/Aditya/project/ascend/app/components/DashboardClient.tsx)

### Dashboard server responsibilities

- fetch profile, stats, active quest selections, and latest cycle in parallel
- detect whether the user needs quest selection
- build cycle report data if the previous cycle ended
- fetch quest pool choices and previous selection IDs for selection phase
- expire stale cycles with `checkAndExpireCycles`
- ensure today's quests exist with `ensureTodayQuests`
- run `checkDailyStreak`
- fetch today's penalty quests
- compute:
  - cycle number
  - Kaizen threshold
  - cycle expiry
  - day count
  - rank color / monarch progress

### Dashboard client responsibilities

- CompletionRing in identity card updates instantly from optimistic quest state
- StreakCard replaces the old two-column streak grid; shows shield state and cycle days
- pending_system_message is read and cleared server-side before render, passed as `shieldMessage` prop
- optimistic quest completion/uncompletion
- auto-refresh if quests are missing due to generation race
- show cycle report overlay
- show selection-phase overlay
- show penalty-zone overlay
- display daily hunt, elite quest, XP, stat cards, streak, cycle info
- subscribe to Supabase realtime updates for `quests` table by `user_id`
- silently register/save push subscription after login if notification permission is already granted
- show level-up and daily-summary overlays

### Daily hunt rules

- Normal cycle selection yields 9 regular quests total:
  - 2 lifestyle
  - 2 physical
  - 2 mental
  - 2 focus
  - 1 bad habits
- Elite quest is separate and weekly, not part of the 9 regular selections.
- Daily completion threshold for streaks is not "all quests"; it is Kaizen-based:
  - cycle 1 -> 4
  - cycle 2 -> 5
  - cycle 3 -> 6
  - cycle 4+ -> 7

### Quest generation notes

Primary logic is in [`app/actions/quests.ts`](/C:/Users/Aditya/project/ascend/app/actions/quests.ts).

Important behavior:

- old incomplete quests from previous days are deleted
- today's quests are generated from active `quest_selections`
- one daily quest is inserted per active non-elite selected quest pool
- elite quest is inserted separately for level 6+ users
- there is an in-process generation lock: `generatingUsers`
- `ensureTodayQuests` also keeps a per-user generated-date cache: `generatedDates`
- quest generation now uses DB upserts with `onConflict: 'user_id,quest_pool_id,date_assigned'` as the final duplicate guard
- `ensureTodayQuests` re-fetches after upsert to survive race conditions
- `fetchToday()` intentionally avoids ordering by `created_at`; the tracked `quests` schema in [`supabase-schema.sql`](/C:/Users/Aditya/project/ascend/supabase-schema.sql) does not define that column, and using it caused valid quest reads to fail and dashboards to show `0` quests
- dashboard client also calls `ensureTodayQuests` on mount if server rendered zero quests and no selection phase is needed

### Elite quest behavior

There are two different elite assignment strategies in the codebase:

- `generateDailyQuests` uses `getWeekNumber()` plus `users.elite_quest_assigned_week`
- `ensureTodayQuests` uses weeks since `users.created_at`

This is an implementation inconsistency worth preserving in memory because future work should unify it rather than accidentally deepen the split.

## Selection cycle system

UI: [`app/components/SelectionPhase.tsx`](/C:/Users/Aditya/project/ascend/app/components/SelectionPhase.tsx)

Server action: `saveQuestSelections` in [`app/actions/quests.ts`](/C:/Users/Aditya/project/ascend/app/actions/quests.ts)

Cycle flow:

- user selects a new 21-day quest loadout when onboarding finishes or a cycle expires
- current active selections are deactivated
- new rows are inserted into `quest_selections`
- a matching `cycles` row is created/upserted
- `users.needs_selection` is set to `false`

Selection rules:

- categories are chosen one at a time
- required counts:
  - lifestyle: 2
  - physical: 2
  - mental: 2
  - focus: 2
  - bad_habits: 1
- UI highlights prior selections with `PREV`
- UI highlights medium quests as `UPGRADE` when the prior cycle included the corresponding small quest in the same `upgrade_group`

Cycle expiry:

- cycles are treated as 21 days long
- `expires_date` is set with `getUTCFutureDateString(21)`
- stale active selections are expired both on dashboard load and in the daily cron route

## XP, levels, ranks, and stats

Source helpers: [`lib/utils.ts`](/C:/Users/Aditya/project/ascend/lib/utils.ts)

### Rank mapping

- F: levels 1-5
- E: 6-15
- D: 16-30
- C: 31-50
- B: 51-70
- A: 71-85
- S: 86-99
- Monarch: 100

### XP curve

- XP required for next level = `level * 500`

### Stat model

Stats stored in `stats`:

- strength
- focus
- discipline
- confidence
- intelligence
- purpose
- energy

Quest rewards usually increment one stat.

Level-up bonus:

- when a quest completion causes a level-up, the rewarded stat gets `quest.stat_reward + 2`

## Streak and penalty system

Core logic lives in:

- [`lib/streakShield.ts`](/C:/Users/Aditya/project/ascend/lib/streakShield.ts) — `updateStreak`, shield helpers (NEW)
- [`app/actions/quests.ts`](/C:/Users/Aditya/project/ascend/app/actions/quests.ts)
- [`app/actions/penalty.ts`](/C:/Users/Aditya/project/ascend/app/actions/penalty.ts)
- [`app/api/cron/daily-reset/route.ts`](/C:/Users/Aditya/project/ascend/app/api/cron/daily-reset/route.ts)
- [`app/components/PenaltyZone.tsx`](/C:/Users/Aditya/project/ascend/app/components/PenaltyZone.tsx)

### Daily result categories

- success: completed quests >= Kaizen threshold
- weak day: completed quests > 0 but below threshold
- failed day: very low or zero completion, with penalty escalation

### Streak Shield mechanic

- Awarded automatically every 21 `cycle_days_completed` (tracked in `users` table)
- Shield absorbs ONE full failure (0 completions) day — streak is NOT reset, penalty is skipped
- Only one shield can be held at a time
- `getShieldState(user)` → `'active' | 'used' | 'not_earned'`
- `getDaysUntilShield(user)` → days remaining to next milestone
- Shield state shown in `StreakCard` component
- When shield is consumed or awarded, `users.pending_system_message` is set and cleared on next dashboard load

### Current streak processing implementation

- `checkDailyStreak()` in [`app/actions/quests.ts`](/C:/Users/Aditya/project/ascend/app/actions/quests.ts) now delegates streak resolution to `updateStreak()` in [`lib/streakShield.ts`](/C:/Users/Aditya/project/ascend/lib/streakShield.ts)
- On shield consumption, the app writes `pending_system_message = 'STREAK SHIELD CONSUMED. FAILURE ABSORBED. ONE CHANCE GIVEN.'`
- On shield award, the app writes `pending_system_message = 'STREAK SHIELD EARNED. 21 DAYS OF CONSISTENCY ACKNOWLEDGED. SHIELD ACTIVE.'`
- `daily_summary.streak_maintained` is treated as true both for normal threshold success and for shield-consumed failure absorption

### Penalty tiers

- Tier 0: none
- Tier 1: partial failure
  - triggered when completed quests are `>= 2` but `< threshold`
  - decrements each missed quest's `stat_target` by 2 via RPC
- Tier 2: hard failure
  - triggered when completed quests are `0` or `< 2`
  - applies flat `-5` all-stat penalty via RPC
  - creates a penalty quest for the next day
  - increments `consecutive_failures`
- Tier 3: Penalty Zone
  - triggered after 3 consecutive hard failures
  - activates a mandatory 2-hour active timer inside a 12-hour deadline window

### Penalty quest behavior

Penalty quests:

- are stored in `penalty_quests`
- appear above normal quests
- can block regular quest interaction when `penalty_tier === 2`
- grant XP when completed
- reset `penalty_tier` to 0 on completion

### Penalty Zone behavior

Penalty Zone UI rules:

- full-screen forced overlay
- user must accumulate 2 continuous active hours
- active time pauses between 11 PM and 7 AM local browser time
- leaving the tab resets timer to 0
- timer state is persisted every 30 seconds via `updatePenaltyActiveTime`
- if completed:
  - clears penalty state
- if failed or timed out:
  - loses 1 level, floor 1
  - rank/xp-to-next-level recalculated
  - current XP reset to 0
  - all stats reduced by 10

Important nuance:

- Penalty Zone timing is based on the browser's local time in the client component.
- Cron timeout checks use server time and `penalty_zone_started_at`.

## Notifications

Client helpers: [`lib/notifications.ts`](/C:/Users/Aditya/project/ascend/lib/notifications.ts)

Service worker: [`public/sw.js`](/C:/Users/Aditya/project/ascend/public/sw.js)

Server action bridge: [`app/actions/notifications.ts`](/C:/Users/Aditya/project/ascend/app/actions/notifications.ts)

Edge functions:

- [`supabase/functions/send-notification/index.ts`](/C:/Users/Aditya/project/ascend/supabase/functions/send-notification/index.ts)
- [`supabase/functions/notification-scheduler/index.ts`](/C:/Users/Aditya/project/ascend/supabase/functions/notification-scheduler/index.ts)

Notification flow:

- browser requests permission
- service worker registers
- browser creates push subscription using `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- subscription is saved to `push_subscriptions`
- server action or edge scheduler calls `send-notification`
- edge function loads subscription and sends Web Push payload

Important configuration detail:

- browser subscription uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- edge functions now accept `VAPID_PUBLIC_KEY` and also fall back to `NEXT_PUBLIC_VAPID_PUBLIC_KEY` if the server-only copy is missing
- `VAPID_EMAIL` may be stored either as `your@email.com` or `mailto:your@email.com`; the edge functions normalize it before calling `web-push`

Scheduled reminder behavior in `notification-scheduler`:

- 9 UTC-hour: morning reminder if 0 quests done
- 14 UTC-hour: midday reminder if progress is behind
- 20 UTC-hour: evening reminder if below threshold
- 21 UTC-hour: streak-at-risk reminder for users with streak > 3 and below threshold
- every 2 hours during active daytime window: Penalty Zone reminder

Important nuance:

- the scheduler uses `now.getUTCHours()` and `today = now.toISOString().split('T')[0]`
- user-facing copy sounds local-time based, but scheduling is currently UTC-based

## Pages summary

### `/dashboard`

- central game screen
- quest interaction
- elite quest
- streak/cycle info
- level-up modal
- daily summary modal
- cycle report / selection / penalty overlays

### `/stats`

File: [`app/(protected)/stats/page.tsx`](/C:/Users/Aditya/project/ascend/app/(protected)/stats/page.tsx)

Shows:

- all seven stats
- today's stat deltas from completed quests
- level/rank/XP progress
- rank ladder
- current/best streak
- total active days
- cycle days remaining
- cycle streak-rate approximation based on `daily_summary`

### `/profile`

File: [`app/(protected)/profile/page.tsx`](/C:/Users/Aditya/project/ascend/app/(protected)/profile/page.tsx)

Shows:

- hunter identity card
- archetype
- rank/day number
- commitment text
- four highlighted stats
- battle record
- achievements/titles
- logout action

## Supabase schema overview

Base schema files:

- [`supabase-schema.sql`](/C:/Users/Aditya/project/ascend/supabase-schema.sql)
- [`supabase-selections-schema.sql`](/C:/Users/Aditya/project/ascend/supabase-selections-schema.sql)
- [`supabase-daily-summary.sql`](/C:/Users/Aditya/project/ascend/supabase-daily-summary.sql)
- [`supabase-needs-selection.sql`](/C:/Users/Aditya/project/ascend/supabase-needs-selection.sql)
- [`supabase-rpc-cycle.sql`](/C:/Users/Aditya/project/ascend/supabase-rpc-cycle.sql)
- [`supabase-elite-week-migration.sql`](/C:/Users/Aditya/project/ascend/supabase-elite-week-migration.sql)
- [`supabase-penalty-system.sql`](/C:/Users/Aditya/project/ascend/supabase-penalty-system.sql)
- [`supabase-trigger.sql`](/C:/Users/Aditya/project/ascend/supabase-trigger.sql)

### Main tables

`users`

- id, email, created_at
- hunter_name, archetype, commitment_text
- rank, level, total_xp, current_xp, xp_to_next_level
- current_streak, best_streak, last_active_date
- needs_selection
- elite_quest_assigned_week
- penalty_tier
- consecutive_failures
- penalty_zone_active
- penalty_zone_started_at
- penalty_zone_active_time
- penalty_zone_completed
- streak_shield_active (boolean) — shield is held and ready
- streak_shield_used_date (date) — when shield was last consumed
- last_shield_earned_date (date) — when shield was last earned
- cycle_days_completed (integer) — successful days in current streak cycle; increments on success days, triggers shield at multiples of 21
- pending_system_message (text) — one-time banner message shown on next dashboard load then cleared; used for shield events

`stats`

- one row per user
- seven main stats + updated_at

`quests`

- daily generated quest rows
- completion state, XP/stat rewards, assignment/completion dates
- linked back to quest pool via `quest_pool_id`

`quest_pools`

- selectable master quest catalog
- includes category, difficulty, reward values, `upgrade_group`

`quest_selections`

- active loadout rows for each cycle

`cycles`

- cycle metadata
- `total_completions` increments via RPC
- `total_days_active` exists in schema but I did not find code updating it yet

`daily_summary`

- analytics/streak result snapshot per user/date

`penalty_quests`

- separate from regular quests

`push_subscriptions`

- stores Web Push subscription JSON per user

`archetype_quests`

- older seed catalog from the first system design
- currently not used by active quest-generation flow, which now relies on `quest_pools`

### RLS posture

RLS is enabled on all major public tables.

General model:

- users can read/write only their own rows
- authenticated users can read shared catalogs like `quest_pools` and `archetype_quests`
- server-side admin work uses the service-role key

### RPC functions

- `increment_stat`
- `decrement_stat`
- `apply_all_stat_penalty`
- `increment_cycle_completions`

## Date and time conventions

Very important:

- The project intentionally uses UTC date strings in `YYYY-MM-DD` format for app logic.
- [`lib/date.ts`](/C:/Users/Aditya/project/ascend/lib/date.ts) explicitly warns against local date methods because the dev machine runs in IST and can drift from UTC dates early in the day.
- However, some UI countdowns and the Penalty Zone rest window use local browser time.

Future contributors should be careful not to mix:

- UTC date storage/business logic
- local-time UI timers
- UTC-based scheduled notifications

## Environment variables

Defined in [`.env.local.example`](/C:/Users/Aditya/project/ascend/.env.local.example):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`

## Deployment and scheduled jobs

Vercel config: [`vercel.json`](/C:/Users/Aditya/project/ascend/vercel.json)

- build command: `npm run build`
- cron:
  - path: `/api/cron/daily-reset`
  - schedule: `0 0 * * *`

The cron route:

- validates `Authorization: Bearer ${CRON_SECRET}`
- processes all users with service-role access
- expires stale cycles
- applies streak updates
- applies penalties
- handles Penalty Zone timeout
- saves `daily_summary`
- generates today's quests if missing

## Styling and UX language

The app has a strong "system / hunter / ascension" visual identity.

UI patterns:

- dark sci-fi palette
- Rajdhani for headings
- Share Tech Mono for system text
- dense uppercase labels
- glow, flicker, scan-line, pulse animations
- mobile-first, card-heavy layout

Avoid flattening this into generic SaaS styling unless explicitly requested.

## Known implementation quirks and risks

- `README.md` is still the default create-next-app README and does not describe the real project.
- There are several visible mojibake characters in file output when viewed via PowerShell, likely from encoding/display mismatch rather than intended copy changes.
- Elite quest assignment logic is inconsistent between `generateDailyQuests` and `ensureTodayQuests`.
- `cycles.total_days_active` appears in the schema and UI report types, but I did not find active update logic for it.
- `archetype_quests` remains in schema/seed data but active daily generation comes from `quest_pools`.
- Notification scheduling logic is UTC-based, while user-facing copy implies day-part reminders.
- There is duplicate auth/onboarding redirect logic in both route handling and the root page, so changes to access rules should keep both paths aligned.
- Parts of this document have been updated incrementally over time; when changing gameplay rules, verify that `memory.md` still matches both the latest code and schema, not just one of them.

## Maintenance note

- Do not keep stale point-in-time worktree snapshots in this file. Document enduring architecture and behavior here; use `git status` directly when you need the current local change state.

## How to update this file

When making future changes, update the sections affected by your work:

- routes or flows -> update "Main user flow" and "Pages summary"
- rules or game mechanics -> update "Dashboard behavior", "Selection cycle system", "XP, levels, ranks, and stats", or "Streak and penalty system"
- DB/schema changes -> update "Supabase schema overview"
- cron/notifications/time behavior -> update "Notifications", "Date and time conventions", and "Deployment and scheduled jobs"
- new risks or oddities -> append to "Known implementation quirks and risks"

Keep the file practical. It should help a future AI or engineer understand the project fast and avoid breaking hidden rules.
