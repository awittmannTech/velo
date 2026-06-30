# Research: Inbox Cleanup / Bulk Triage + Auto-Tagging (Smart Labels)

Competitive teardown for Velo. Goal: steal proven UX and logic for (1) smart inbox
cleanup / bulk triage and (2) auto-tagging with a *useful* default taxonomy.

---

## FEATURE 1 — Smart inbox cleanup / bulk triage

### Per-product notes

**SaneBox** — Server-side AI sorter layered on existing IMAP. Core mechanic: classifies
each sender into folders based on *past behavior* (what you open/reply/ignore). Default
folders: `@SaneLater` (non-urgent), `@SaneNews` (newsletters/lists), `@SaneBlackHole`
(drag here → that sender auto-deleted forever, with a 7-day review window before purge),
plus snooze folders `@SaneTomorrow`/`@SaneNextWeek`. **Training = drag-and-drop**: moving a
mail between folders permanently retrains the sender rule. "Learns in <1 week." Safe
because: BlackHole keeps a 7-day review buffer; nothing is hard-deleted immediately; rules
are per-sender and reversible by dragging back.
Sources: https://www.sanebox.com/help/155-how-does-sanebox-work ,
https://www.sanebox.com/help/140-how-do-i-train-teach-sanebox ,
https://www.sanebox.com/help/235-saneblackhole-what-do-i-do-with-my-saneblackhole-folder

**Clean Email** — Header/metadata-only scanner. Core mechanic: groups thousands of mails
into **Smart Views / Cleaning Suggestions** by sender, age, size, type (newsletters,
social, finance, large attachments). Bulk-act on a whole group at once: delete, archive,
move, label, mark read, star. **Unsubscriber** = one view of all mailing lists → pause /
keep / unsubscribe in bulk. "Auto Clean" makes a one-time group action into a standing rule
for future mail. Safe because: you review the grouped preview before acting; archive (not
delete) default; actions reversible.
Sources: https://clean.email/unsubscriber , https://email-tools.me/posts/how-to-use-clean-email/

**Gmail (built-in)** — (a) **Manage subscriptions** view (2025/26): left-sidebar dashboard
listing active subscription senders sorted by *most frequent*, each row shows count of mails
sent in recent weeks + one-click Unsubscribe (Gmail fires the unsubscribe on your behalf,
across all that sender's lists). (b) Category tabs (Primary/Social/Promotions/Updates/
Forums) auto-bucket promo + social. (c) "Tidy"/cleanup prompts suggest unsubscribing from
rarely-opened senders. Safe: unsubscribe-only, doesn't bulk-delete history.
Sources: https://blog.google/products-and-platforms/products/gmail/new-manage-subscriptions-unsubscribe/ ,
https://support.google.com/mail/answer/15621070

**Superhuman** — **Split Inbox** + **Auto Labels**. AI classifies every mail into built-in
categories (Marketing, News, Pitch/cold-outreach, Social) which by default route to an
"Other" split, keeping the main inbox to real people. Custom Auto Labels via natural-
language prompt (limit ~10 AI prompts). Applies to new mail + backfills last 14 days. Triage
is keyboard-first; bulk select + archive. Safe: it *routes/labels* rather than deletes;
splits are reversible views.
Sources: https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels ,
https://techcrunch.com/2025/02/19/superhuman-introduces-ai-powered-categorization-to-reduce-spammy-emails-in-your-inbox/

**Shortwave** — AI **Bundles**: groups low-priority similar mail (newsletters, social,
receipts) into a single inbox line item → "review and archive dozens with one click."
**Magic Labels**: remembers how you labeled a sender and auto-applies to future mail; AI
filters defined in natural language. Claims inbox-zero 45% faster than Gmail. Safe: bundles
are collapsible views, archive-not-delete.
Sources: https://www.shortwave.com/blog/magic-labels-custom-bundles/ , https://www.shortwave.com/

**Hey** — Opinionated workflow, not bulk-cleanup. **The Screener**: every first-time sender
is held in a pending queue; you Screen-In (→ Imbox) or Screen-Out (→ never seen again) once
per sender. **Imbox** = mail you actually want. **Feed** = newsletters/promos as a scrollable
newsfeed (all pre-opened, no per-item triage). **Paper Trail** = receipts/transactional kept
out of the way but searchable. **Reply Later** = pile at bottom of screen for mails needing a
reply; **Set Aside** = reference pile. Safe: Screener decisions are per-sender + reversible;
nothing deleted.
Sources: https://www.hey.com/how-it-works/ , https://www.hey.com/features/paper-trail/

**Spark** — **Smart Inbox** auto-buckets unread into People / Notifications / Newsletters
cards. **Gatekeeper** (paid): first mail from a new sender prompts Accept or Block (invisible
to sender). Mis-sorted mail can be reclassified, and the correction applies to all future
mail from that sender. Smart folders filter by sender/attachment/content. Safe: per-sender
reclassification, block is reversible.
Sources: https://sparkmailapp.com/features/smart_inbox ,
https://support.readdle.com/spark/personalization/customize-your-smart-inbox

**Mailstrom** — Pure bulk-cleanup engine. Groups mail across 6 dimensions: sender, subject,
date range, size, mailing list, social. Select a bundle → Delete / Archive / Move / **Block**
/ **Chill** (route future to a "later" folder) / **Expire** (auto-delete future after N days).
Auto-Clean turns a cleanup into a standing rule ("once clean, stays clean"). Header/metadata
only. Demonstrated clearing 22k–100k+ mails in minutes. Safe: explicit per-bundle action,
nothing moves without confirmation.
Sources: https://mailstrom.co/articles/best-email-cleanup-tools-2026/ , https://siteefy.com/tools/mailstrom

**Unroll.me** — Subscription-focused. Scans for subscription senders, lists them, each gets
3 choices: **Keep** (stays in inbox), **Block** (→ Unsubscribed folder, hidden), **Rollup**
(removed from inbox, compiled into one **daily digest** at chosen time). Unsubscribe fires
24h later and auto-trashes future mail from that sender as backup. (Privacy caveat: monetized
inbox data historically.) Safe-ish: rollup/block reversible; relies on real unsubscribe.
Sources: https://support.unroll.me/hc/en-us/articles/200271733-What-is-the-Rollup ,
https://support.unroll.me/hc/en-us/articles/201748983

### Patterns to steal — CLEANUP (ranked by impact ÷ effort)

1. **Group clutter by sender with counts + one-click "archive all / unsubscribe + delete
   all."** (Highest impact, low effort.) SQL `GROUP BY from_address` over local messages,
   show sender + count + last-received + has-List-Unsubscribe. One row → bulk archive,
   bulk-trash, or unsubscribe. This is the shared core of Mailstrom, Clean Email, Gmail
   Manage-Subscriptions. Already have List-Unsubscribe handling (`unsubscribeManager.ts`)
   and grouping is a query.
2. **Bulk unsubscribe view (RFC 8058 one-click).** (High impact, low effort.) Dedicated
   screen of all senders with `List-Unsubscribe` headers, sorted by frequency, opened-rate
   if known. Unsubscribe individually or multi-select. You already implement RFC 8058 +
   mailto fallback — just need the aggregated UI.
3. **Age/unread-based sweeps.** (High impact, low effort.) "Archive everything older than
   90 days" / "archive promotions unread for 30 days." Parameterized SQL by `internal_date`
   + label + read flag. Mirrors Clean Email "Old mail" + Mailstrom date-range.
4. **"Keep newest N, archive the rest" per sender.** (Med-high impact, med effort.) Per
   high-volume sender (newsletters, notifications), keep most recent and sweep older.
   Window function over sender groups.
5. **Standing rules from a cleanup action ("Auto Clean").** (High impact, med effort.) After
   a bulk action, offer "Always do this for future mail from X" → writes a `filter_rules`
   row. You already have `filterEngine.ts`; reuse it. This is Mailstrom Auto-Clean / SaneBox
   per-sender rules / Clean Email Auto Clean.
6. **Suggestion cards you accept.** (Med impact, med-high effort.) AI surfaces "You haven't
   opened 142 mails from Substack in 60 days — unsubscribe + archive?" as dismissible cards.
   Generate cheaply from local stats first; use the AI model only to phrase/prioritize, not
   to scan every mail (cost control).
7. **"BlackHole / Block sender" with review buffer.** (Med impact, low effort.) Drag/seed a
   sender to a block list; future mail auto-archived/trashed after a 7-day safety window
   (SaneBox pattern). Reuse `phishing_allowlist`-style table.

**Safety primitives shared by all winners** (build these once, apply everywhere):
- Default to **Archive, not Delete**; permanent delete only as explicit second step (Velo
  already does two-stage trash).
- **Preview the grouped set + exact count** before any bulk action ("Archive 1,243 mails
  from 18 senders?").
- **Single Undo** for the whole batch (snapshot affected message IDs + prior labels; one
  click reverts). Critical — this is what makes bulk feel safe.
- **Header/metadata-only** grouping (no body reads) keeps it fast and cheap.
- Per-sender, reversible decisions (drag back / re-accept).

---

## FEATURE 2 — Auto-tagging / smart labels with a useful taxonomy

### Per-product notes (default taxonomies + assignment method)

**Gmail** — Categories: Primary, Social, Promotions, Updates, Forums (rule+ML, system-
assigned, not user-defined). Labels + Filters are user-defined and rule-based. No suggested
*personal* taxonomy; you build your own. Existing-mess handling: none — labels accrete.

**Shortwave** — AI **Magic Labels / Bundles**: ships sensible defaults (Newsletters,
Purchases/Receipts, Travel, Notifications, Social) + learns per-sender; AI-assigned, applied
in background, user can override and the override sticks per sender.
Source: https://www.shortwave.com/blog/magic-labels-custom-bundles/

**Superhuman** — Built-in Auto Labels: **Marketing, News, Pitch (cold outreach), Social**.
AI-assigned via classifier; custom labels via NL prompt. Split Inbox built on top of labels.
Source: https://help.superhuman.com/hc/en-us/articles/40127432866323-Auto-Labels

**Hey** — Fixed, opinionated 3-bucket taxonomy: **Imbox** (wanted human/service mail),
**Feed** (newsletters/long-reads/promos), **Paper Trail** (receipts/transactional). Assigned
per-sender at Screen-in time; you pick the destination once, it's not AI guessing per-mail.
Source: https://www.hey.com/how-it-works/

**SaneBox** — Folder-as-taxonomy: **SaneLater** (defer), **SaneNews** (newsletters),
**SaneBlackHole** (junk-forever), plus optional SaneCC, SaneReceipts, SaneNotifications.
Behavior-learned per sender; suggests the taxonomy by shipping the folders pre-made.
Source: https://www.sanebox.com/learn

**Spark** — **People / Notifications / Newsletters** (+ Priority). Auto-assigned, per-sender
correction sticks.
Source: https://sparkmailapp.com/features/smart_inbox

**Missive** — Shared labels for teams; **AI rules** that ask a yes/no question about each
incoming mail ("Is this a refund request?") and apply a label/route on the answer. Rule- or
AI-assigned, user-defined taxonomy.
Source: https://missiveapp.com/docs/advanced-features/rules/faq

**Fyxer / GTD-style "AI sorts your email"** — Intent taxonomy: To Respond, FYI, Newsletter,
Marketing, Notification; or urgency × type matrices. Classic GTD email folders: **Action /
Awaiting Response / Reference / Archive** — the most durable manual taxonomy.
Sources: https://www.fyxer.com/blog/automatic-email-categorization , https://dansilvestre.com/gtd-gmail/

### Key cross-product insights
- The useful taxonomies are **intent + type hybrids**, not topics. Two axes:
  (A) **Action state** (To respond / Awaiting reply / FYI) — the GTD core, the highest-value
  labels, and (B) **Content type** (Newsletters / Receipts / Travel / Finance / Social /
  Notifications) — cheap to classify, big visual declutter.
- Winners **ship a default taxonomy** rather than asking users to invent one (Hey, SaneBox,
  Spark, Superhuman). Suggest-don't-ask.
- Assignment is mostly **per-sender memory** (cheap, deterministic) with AI only for the
  ambiguous/first-seen cases — this controls cost and avoids flip-flopping.
- "Your existing messy tags": no competitor really migrates them. Opportunity for Velo —
  offer a one-time **"clean up my labels" wizard**: cluster existing labels, propose merges
  into the default taxonomy, archive unused labels, keep a mapping so old tags still resolve.

### Patterns to steal — AUTO-TAGGING (ranked)

1. **Ship a default taxonomy + one-screen "Apply smart labels" onboarding.** Highest impact.
   Propose the taxonomy below, show a preview ("we'll tag ~2,400 mails"), let user toggle
   categories off, then backfill. You already have `smartLabelService` + `backfillService` —
   seed it with these defaults.
2. **Per-sender memory first, AI second.** When user (or AI) tags a sender, store the mapping
   and apply deterministically to future mail; only invoke the model for unseen senders /
   action-state labels. Mirrors Shortwave Magic Labels; minimizes AI cost.
3. **Action-state labels via lightweight AI** (To respond / Awaiting reply). Classify on the
   newest message only; "Awaiting reply" can be pure rule: you sent last + no reply in N days
   (you already have `followupManager`). "To respond" = inbound question/request to you.
4. **Content-type labels via rules + List headers** (Newsletters via `List-Id`/
   `List-Unsubscribe`; Receipts via sender/subject patterns; Travel/Finance via sender
   domains + keywords). Cheap, no AI. AI only as fallback.
5. **NL-prompt custom labels** (Superhuman/Shortwave/Missive). Let power users define a label
   with a sentence; AI classifies. You have `smart_label_rules` with optional criteria — add
   an NL-prompt path.
6. **Inline correction that retrains the sender** (Spark pattern): changing a mail's label
   updates the per-sender rule for all future mail, with a toast confirming.
7. **Label cleanup / merge wizard** for the user's existing messy tags (differentiator —
   nobody does this well).

### Recommended DEFAULT taxonomy (prosumer inbox)

Two groups. Keep it small — 7±2 visible labels beats 30.

**Action state (AI/rule-assigned, mutually exclusive, drive triage):**
- **To respond** — Inbound mail that asks you a question or requests an action; needs a reply.
- **Awaiting reply** — You sent the last message and are waiting on them (rule: outbound last
  + N days no response).
- **FYI** — Addressed to you, informational, no reply expected (announcements, direct
  notifications from a human).

**Content type (mostly rule-assigned, declutter + browse):**
- **Newsletters** — Subscriptions, digests, long-reads (detected via `List-Id` /
  `List-Unsubscribe`).
- **Receipts** — Order confirmations, invoices, payment + shipping notifications.
- **Travel** — Flight/hotel/car/rail confirmations and itineraries (keyword + known senders).
- **Finance** — Bank, card, brokerage, tax, statements.
- **Social** — Social-network and community notifications.
- **Promotions** — Marketing / deals (low priority; candidates for bulk sweep).

(Optional power-user: **Calendar/Invites**, **Cold pitch**.) Map this taxonomy 1:1 onto the
cleanup engine: Promotions + Newsletters feed the bulk-unsubscribe and age-sweep screens;
Receipts/Travel/Finance feed search & "keep forever, hide from inbox."

### UX for proposing + applying
1. Onboarding card: "Velo can auto-organize your inbox into these labels." Show the list with
   a count next to each ("Newsletters · 1,240"). Toggles per label.
2. **Dry-run preview** before committing — list sample mails per label, let user reassign.
3. Apply: rules/header-detection instantly; AI labels backfilled in a throttled background job
   with a progress toast.
4. Ongoing: per-sender memory + inline correction. Monthly "label health" nudge.

---

## Pitfalls / safety considerations
- **False-positive bulk deletes** are the cardinal sin. Always archive-not-delete by default,
  always preview + count, always one-click batch Undo, never auto-purge without a review
  buffer (SaneBox's 7-day BlackHole window is the model).
- **Unsubscribe that isn't real**: a spammer's List-Unsubscribe can confirm a live address.
  Prefer RFC 8058 one-click POST (safe) over mailto/web for unknown senders; for sketchy
  senders, block+archive locally instead of pinging them.
- **Over-tagging / label sprawl**: cap visible labels (~9), make labels mutually exclusive
  within the action-state group, hide noisy content labels behind a "more" disclosure.
- **AI cost + latency**: do NOT run the model over every message. Gate AI behind
  (a) per-sender cache, (b) header/rule fast-paths, (c) classify newest-message-only,
  (d) batch backfill with rate limits. Cache results in `ai_cache` (already present).
- **Flip-flopping classifications** erode trust: once a sender→label is set, keep it stable;
  only re-evaluate on explicit user correction.
- **Privacy**: do grouping/classification locally over SQLite where possible (Velo's edge vs
  Unroll.me, which monetized inbox data). Only send minimal context to the model.
