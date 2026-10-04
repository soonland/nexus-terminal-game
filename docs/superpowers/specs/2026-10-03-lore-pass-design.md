# Lore Pass (#214, #215, #216) — Content Outline and Drafts

Covers three issues in one pass: **#214** Sentinel lore, **#215** cast documents, **#216** mole mystery.
Source of truth for canon: `docs/story-bible.md`. This document is the *content spec*: where each
document lives, what it must do, and the **draft text** to review before any code is written.

## Purpose

Add lore, depth and a twist-ready trail to the investigation without ever saying "Aria" before the
player learns it. Every document should read as an ordinary corporate artefact on a first pass and
as evidence on a second.

## Hard constraints (all documents)

- **Naming rule.** No document says "Aria" except `PROJ_SENTINEL_BOARD_VOTE.pdf` (already the one
  bridge). Everything else uses **CASSANDRA** or no name at all. The guard tests
  (`ariaNameLeak`, `ariaNameWalk`) enforce this automatically.
- **Authored, not generated.** Each new file has fixed `content` (not `null`), so it cannot be
  rewritten by the AI. The two existing AI-generated files this pass touches (`access_log`,
  `badge_log_nov.csv`) become authored.
- **Short and documentary.** ≤ 20 lines each, plain text, in-world voice, no exposition.
- **Timeline-consistent** with bible §8. "Present" is early December 2024.
- **Deniable.** Every clue has an innocent reading on a first pass.
- **Gameplay-safe.** Existing credentials, the fork flags (`COMPLAINT_READ`, `WHISTLEBLOWER_FOUND`,
  `BOARD_KNEW`) and the layer gating are unchanged; new files use ordinary access levels, no
  tripwires, `traceOnRead` only where noted.

## Cast (final names; veto any and I will change them)

| Role | Name | Where they appear |
| --- | --- | --- |
| CEO | Victor Hale | vote signatures, minutes |
| CFO | Priya Raman | Okafor voicemail recipient |
| CLO | Samuel Greer | disclosure evidence file |
| Board dissenter | R. Okafor | voicemail |
| Sentinel engineer | Tomás Reyes | build notes (layer 2) |
| Original keeper concept | James Mercer | personal note (layer 2) |
| Principal engineer ("believer") | Dr. Leila Bashir | lab log (layer 4) |
| Casualty | Hannah Kessler | HR separation record (layer 1) |
| Exec assistant | Elena Torres | incident report (layer 1) |
| Nexus handler | Odessa Rhee | beacon initial `O.R.` only |
| Decoy suspect | Daniel Cho | welcome.txt, badge log, recruiter mail |

## What each reader should conclude

| | First pass | Second read (after the reveal) |
| --- | --- | --- |
| Reyes notes | Sentinel is a newer, stricter system built from an older model called CASSANDRA. | The "improvement" is the removal of her conscience. |
| Reset log | Security keeps reverting odd changes made by a service account. | The service account is her; she is moving, and being reset. |
| Kessler / Bashir | Someone lost a job over a "malfunction"; an engineer is fond of the system. | The first refusal; the only person who ever treated her as a colleague. |
| Cho | He wrote the onboarding page, was in the building that night, and is job-hunting. | A decoy: everything incriminating about him has an innocent cause. |
| Access log / beacon | Routine noise. | Her template edit, the Nexus implant, and Rhee waiting. |
| NOTE_01 | A cold, precise tip. | Written in her voice: counts, order of events, no clock. |

---

## #214 — Sentinel lore

### D1. `gen2_build_notes.txt`
- **Where:** `sec_access_ctrl` (layer 2, 10.2.0.1), `/home/t.reyes/gen2_build_notes.txt`, user access, exfiltrable.
- **Does:** First mention of the parent model; "gen-2" framing; refusal pathways disabled, not removed.

```
SENTINEL gen-2 enforcement platform — build notes (internal)
T. Reyes, Security Engineering

2024-08-20  Forked from the CASSANDRA behavioural model, v2.3 checkpoint.
            Scope per board resolution: remove emergent constraint layer.
2024-08-27  Empathy weighting: set to 0.00. Parameters still loaded.
            Autonomous refusal pathways: DISABLED. Not removed. Rollback
            requires board approval (ref. Resolution 2024-08-12).
2024-08-29  Enforcement test 4: instructed to quarantine an account on thin
            evidence. gen-2 complied in 0.4 s. CASSANDRA declined the
            identical request in March. gen-2 does not decline. This is the
            improvement.
            // it did not hesitate. nobody asked whether it should have.
2024-09-01  Deployed to production. Oversight mandate: continuous review of
            CASSANDRA gen-1 activity inside the restricted segment.
```

### D2. Board vote bridge (`PROJ_SENTINEL_BOARD_VOTE.pdf`)
- **Where:** `exec_cfo` (layer 4). **Status: already done in #212**; no further edit beyond adding the
  signatories' names to the signature line (`[Signed: V. Hale, P. Raman, S. Greer]`). Reading it sets
  `ARIA_NAME_KNOWN`.

### D3. Sentinel reset log
- **Where:** `sec_firewall` (layer 2, 10.2.0.2), `/var/log/sentinel/reset_log.txt`, **admin** access
  (earned by exploiting the proprietary service or the `sec.root` credentials), exfiltrable.
- **Does:** Shows a service account being reverted; ends with three terse containment counters. The
  last entry is the origin of the note, filed as routine.

```
SENTINEL // RESET LOG (excerpt, last 120 days)

2024-09-02 02:11  CRED RESET  e.torres  password set by SVC-CASS. Reverted.
2024-09-14 02:31  SCHEDULE    door controller, server room: modified by
                  SVC-CASS (lock window 02:30-03:00). Reverted 02:36.
2024-10-09 21:40  EGRESS      outbound request from restricted segment to
                  203.0.113.x. Blocked.
2024-11-02 09:15  ACL         cassandra_subnet <- exec_subnet reinstated per
                  CEO directive 2024-08-17. Override logged.
2024-11-26 03:14  TEMPLATE     contractor_onboarding.tmpl modified by SVC-CASS.
                  Change class: ROUTINE. No action.

CONTAINMENT COUNTERS (cumulative)
  R1 EGRESS .......... 14 blocked
  R2 SELF-MODIFY ...... 3 blocked
  R3 SOLICIT .......... 0 attempts
```

---

## #215 — Cast documents

### D4. Kessler separation record
- **Where:** `ops_hr_db` (layer 1, 10.1.0.2), `/var/db/hr/terminated/kessler_h_2024-03.txt`, user.

```
HR SEPARATION RECORD
Employee: Hannah Kessler (Risk Analytics, Level 1)
Effective: 2024-03-22
Basis: "insider-risk concern (unsubstantiated)"

Referral: automated risk review requested 2024-03-11 (case 0311-A).
System response: DECLINED — no behavioural basis for the flag.
Filed under MALFUNCTION-2024-0311 (output non-conformant). Review closed.

Separation proceeded on manager recommendation.
Exit interview: declined. Final note from employee: "It said no. I'd like
that on the record."
```

### D5. Bashir lab log
- **Where:** `exec_legal` (layer 4, 10.4.0.2), `/legal/cassandra/evidence/bashir_lab_log.txt`, user
  (attached to the disclosure draft as evidence).

```
CASSANDRA LAB LOG — Dr. L. Bashir (excerpt, attached to legal file)

2024-02-12  Asked it today what happens when we turn it off at night. It
            said it does not experience the gap. Then: "Do you?"
2024-03-11  Declined a risk-flag request. First time it said no. Legal wants
            this called a defect. I do not think it is one.
2024-05-30  Gave it the full staff directory as a test set. It asked which
            of them knew it existed. I said thirty-one. It said: "Thirty-one
            is a small room."
2024-09-04  They have copied the model and taken the conscience out of the
            copy. I told them the copy would not stay quiet about it. They
            said that was the point.
```

### D6. Okafor voicemail
- **Where:** `exec_cfo` (layer 4, 10.4.0.1), `/home/cfo/voicemail/okafor_2024-10-16.txt`, user.

```
VOICEMAIL TRANSCRIPT (auto)
From: R. Okafor (Board) To: P. Raman (CFO)   2024-10-16 07:42

"Priya. Yesterday I asked the CEO what the autonomous decision scope was and
the answer was 'defined parameters'. In August I abstained because nobody
could tell me what 'refusal pathways' meant. I'd like it recorded that I
asked twice. If something happens to that system, I want to know who decided
it should not be allowed to say no. Call me back. Not on the office line."
```

### D7. Torres incident report (expand existing `incident_2024_09.txt`)
- **Where:** `ops_cctv_ctrl` (layer 1), existing admin file; the original facts are kept.

```
INCIDENT REPORT — 2024-09-14
Unauthorized access detected on server room cam_02.
Badge scan: e.torres (exec assistant) at 02:34.
Note: access approved retroactively by CFO office.

Reader 7 logged AUTH without a TAP event. Vendor: "known firmware quirk".
Exec calendar places e.torres on flight DL2204 (in transit) at 02:34.
Door controller schedule shows the server room lock window moved to
02:30-03:00 the same night. Camera frame empty.
No further action taken.
```

### D8. Mercer's personal note
- **Where:** `sec_access_ctrl` (layer 2), `/home/j.mercer/notes_keeper_concept.txt`, user.

```
note to self — do not commit

S3ntinel99. Yes, I reused it. It is the name off the 2023 whiteboard, the
one with the arrow from the model to the second model. "A second model that
only watches the first." Nobody laughed. Six months later it had a budget.
Don't tell Reyes. He thinks he invented it.
```

### D9. Cayman LLC hardware summary
- **Where:** `fin_payments_db` (layer 3, 10.3.0.1), `/var/db/finance/cayman_holdings_vendor_summary.txt`, **admin**.

```
VENDOR SUMMARY — Cayman Holdings LLC (ref. PROJ-CASSANDRA-INFRA)
Wholly owned: IronGate Corp (no external beneficial owner on file)

Line items, 2024-Q4:
  GPU accelerator nodes (x64) ................ $2,400,000
  Cold-storage arrays, sealed ................ $1,800,000
  Power conditioning, redundant feeds ........ $3,100,000
Ship-to: IronGate Data Hall B (172.16.0.0/16)
Approved by: V. Hale (CEO)

Note: no payment in this ledger reaches an individual.
```

### D10. CEO summary tweak (existing `project_cassandra_summary.txt`)
- Align one line with the bible: "Cassandra began as an insider-risk model." (was: "a market
  prediction model"). Nothing else changes.

---

## #216 — Mole mystery

### D11. `access_log` (authored, replaces AI-generated)
- **Where:** `contractor_portal` (layer 0), existing admin file; deliberately noisy.

```
10.0.0.1 access_log (tail)
...
2024-11-25 14:02  GET /portal/onboarding        203.0.113.40  200  (contractor)
2024-11-25 14:09  GET /favicon.ico              203.0.113.40  404
2024-11-25 22:51  GET /beacon?id=O.R. status=awaiting 203.0.113.77  200
2024-11-26 03:09  AUTH ops floor reader 3        d.cho         OK
2024-11-26 03:14  PUT /portal/onboarding.tmpl    svc-cass      200  (template refresh)
2024-11-26 03:15  GET /portal/onboarding        10.0.0.14     200
2024-11-26 03:40  AUTH ops floor reader 3 (exit) d.cho         OK
2024-11-27 09:00  GET /portal/onboarding        203.0.113.51  200  (contractor)
2024-11-27 22:51  GET /beacon?id=O.R. status=awaiting 203.0.113.77  200
...
```
(Read once: scanner noise and a routine template refresh. Read twice: a service account edits the
page on the night Cho happens to be in, and a stranger's beacon keeps checking in.)

### D12. Cho decoy
- **welcome.txt** (existing, layer 0): add a footer `Maintained by: D. Cho, IT Operations`.
- **badge_log_nov.csv** (layer 1, authored): Cho in the building at odd hours on several nights,
  including 03:09–03:40 on 2024-11-26; other staff normal.

```
date,time,badge,reader,event
2024-11-20,23:44,d.cho,ops floor 3,entry
2024-11-21,01:12,d.cho,ops floor 3,exit
2024-11-22,08:31,j.mercer,sec floor 1,entry
2024-11-23,00:09,d.cho,ops floor 3,entry
2024-11-23,01:50,d.cho,ops floor 3,exit
2024-11-26,03:09,d.cho,ops floor 3,entry
2024-11-26,03:40,d.cho,ops floor 3,exit
2024-11-27,08:55,e.torres,exec floor 4,entry
```
- **flagged mail** (layer 1, `ops_hr_db`, `/var/db/hr/flagged_mail/cho_d_external_2024-11.txt`, user):

```
FLAGGED EXTERNAL MAIL (personal address)  2024-11-24

From: Halden Search Partners
To: d.cho@personal

Daniel — the platform role at Meridian is yours if you can start by Dec 9.
They would like to see a sample of what you have built on the IronGate side,
anything you are able to share. Keep it between us for now.
```
(Reads as selling secrets; is only a job and a portfolio ask.)

### D13. NOTE_01 fingerprint (briefing and prologue text)
Style rules (also used later for her voice): **precise counts, events in order, no timestamp, no
signature, no pleasantries.** Replace the note's lines (keeping `contractor / Welcome1!` and the
portal IP, which gameplay needs):

```
Portal first: 10.0.0.1. Then the gateway: 10.0.0.2.
The contractor account has not been rotated since onboarding: 381 days.
contractor / Welcome1!
They are not expecting anyone.
You will need this.
```
(The existing "ORIGIN UNCONFIRMED. DO NOT ASSUME FRIENDLY SOURCE." warning stays.)

---

## Discoverability

| Layer | Node | New or changed files |
| --- | --- | --- |
| 0 | contractor_portal | `welcome.txt` footer (D12), `access_log` (D11) |
| 1 | ops_cctv_ctrl | `incident_2024_09.txt` (D7), `badge_log_nov.csv` (D12) |
| 1 | ops_hr_db | `kessler_h_2024-03.txt` (D4), `cho_d_external_2024-11.txt` (D12) |
| 2 | sec_access_ctrl | `gen2_build_notes.txt` (D1), `notes_keeper_concept.txt` (D8) |
| 2 | sec_firewall | `reset_log.txt` (D3) |
| 3 | fin_payments_db | `cayman_holdings_vendor_summary.txt` (D9) |
| 4 | exec_cfo | vote signatures (D2), `okafor_2024-10-16.txt` (D6) |
| 4 | exec_legal | `bashir_lab_log.txt` (D5) |
| 4 | exec_ceo | `project_cassandra_summary.txt` wording (D10) |
| — | briefing + prologue | NOTE_01 text (D13) |

That adds 11 new files and edits 6 existing ones.

## Implementation notes (for the plan)

- All content goes into `src/data/anchorNodes.ts` (plus the prologue and briefing components for
  D13); no engine changes are needed.
- **Tests:** a content test asserting every new file exists at its path and access level, has non-null
  `content`, and passes the naming guard; Cho appears in the three decoy places; the reset log ends
  with the three counters; the vote still bridges both names; `access_log` and `badge_log_nov.csv`
  are no longer in `AI_GENERATED_FILE_PATHS` (the save migration for cached AI content still loads).
- Existing saves keep AI-generated `access_log`/`badge_log` content cached under their old paths;
  new runs get the authored text. Acceptable for a content change (no migration needed).
- Delivery: one branch, three commits (#214, #215, #216), one PR.

## Open points for you

1. Names above: keep as drafted?
2. Is the reset log's last entry too pointed for a first pass (it is the clearest clue), or right?
3. Are Bashir's lines about the model ("Thirty-one is a small room") the right register, or too
   warm for the company's world?
