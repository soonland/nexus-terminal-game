# Balance Notes — P10-04

**Issue:** [#32](https://github.com/soonland/nexus-terminal-game/issues/32)  
**Completed:** 2026-04-15  
**Method:** 5 automated playthroughs via `playwright-playthrough.mjs` (critical-path script)

---

## Methodology

An instrumented `TraceAuditEntry[]` log (added in this pass) records every trace delta
event with source label, turn, delta, and running total. `saveGame` writes it to the
separate `irongate_trace_audit` localStorage key so the Playwright script can read and
summarise it without parsing the full save format.

Each playthrough follows the optimal path:

```
contractor_portal → vpn_gateway
→ ops_cctv_ctrl → ops_hr_db        (Layer 1 — pick up decryptor + log-wiper)
→ sec_access_ctrl → sec_firewall    (Layer 2 — Fork 2 Path B: exfil fw_backup)
→ fin_payments_db → fin_exec_accts  (Layer 3 — find exec-assistant creds)
→ exec_cfo → exec_legal → exec_ceo  (Layer 4 — exfil aria_key.bin)
```

---

## Results — 5 runs

All 5 runs produced identical trace profiles (the optimal path is deterministic with
the port-scanner active):

| Source                           | Δ trace |
|----------------------------------|---------|
| exploit:proprietary              | +4      |
| exfil:decryptor.bin              | +3      |
| exfil:log-wiper.bin              | +3      |
| cat:fw_backup_2024.cfg           | +3      |
| exfil:fw_backup_2024.cfg         | +3      |
| cat:project_aria_summary.txt     | +3      |
| exfil:aria_key.bin               | +3      |
| exploit:http                     | +2      |
| decrypt:new-cred                 | +2      |
| cat:calendar_access.cfg          | +2      |
| cat:exec_compensation.xlsx       | +2      |
| cat:board_minutes_oct.pdf        | +2      |
| cat:PROJ_SENTINEL_BOARD_VOTE.pdf | +2      |
| cat:camera_config.ini            | +1      |
| exploit:aria-socket              | +0      |
| scan (×6, port-scanner active)   | +0      |
| **wipe-logs**                    | **−15** |
| **Total**                        | **+20** |

**Peak trace before wipe-logs:** 35%  
**Final trace (Layer 4 complete):** 20%  
**Sentinel activated:** never (threshold is 61%)

---

## Key observations

### Optimal path is generous — burn is not a real threat

A first-time player following the happy path will end under 25% trace. Burn (100%)
requires either hitting many tripwires, making repeated failed logins (+5 each), or
attempting wrong exploits (+10 each for patched/no-vuln). This satisfies the acceptance
criterion: _no run should end at burn before Layer 3 on a first playthrough unless
deliberately reckless._

### Sentinel activation (61%) only fires for sloppy play

The threshold is appropriate. A player would need to accumulate ~26 trace above the
clean path to cross 61%. That takes roughly:
- 5+ failed login attempts, or
- 3 wrong-service exploits, or
- 2 triggered tripwires, or
- a combination of the above.

### Scan cost is low with port-scanner (correct by design)

The port-scanner tool (default loadout) makes all scans free. Without it, scans cost
+1 or +2 each. 6 required scans × 2 max = +12 worst-case additional trace, bringing a
no-tool player to ~47% before wipe-logs. Still under 61%.

---

## Values — before and after this pass

| Parameter                | Before  | After   | Rationale |
|--------------------------|---------|---------|-----------|
| `sentinelInterval`       | **1**   | **2**   | Halves sentinel aggression once activated. At interval=1, every command during a sentinel-active run triggered an action — punishing for struggling players still learning commands. Interval=2 keeps pressure meaningful without being relentless. |
| `TRACE_THRESHOLDS`       | [31, 55, 61, 86] | unchanged | 61% activation is the right trigger; 31% and 86% alert thresholds are well-placed. |
| Starting charges (default) | 4     | unchanged | Spec note "currently 3" was stale. Code already used 4 (allows one buffer charge above the 3 needed by the optimal path). |
| wipe-logs upgrade (→ interval 3) | 1→3 | 2→3 | Still a meaningful upgrade: cuts sentinel cadence by 33% vs the default. |

---

## Sentinel action frequency — worked example

At default interval=2, a player who crosses 61% trace at turn 30 would see:

| Turn | Sentinel acts? |
|------|---------------|
| 30   | yes (30 % 2 = 0) |
| 31   | no  |
| 32   | yes |
| 33   | no  |
| …    | every other turn |

With the wipe-logs upgrade (interval=3):

| Turn | Sentinel acts? |
|------|---------------|
| 30   | yes (30 % 3 = 0) |
| 31   | no  |
| 32   | no  |
| 33   | yes |
| …    | every third turn |

---

## Out of scope (not changed in this pass)

- Individual `traceContribution` values on anchor services (2–4 range — appropriate)
- `traceOnRead` values on individual files (1–3 range — appropriate)
- Failed-login cost (+5 — intentionally punishing, skill-gates credential discovery)
- Exploit failure cost (+10 for patched/no-vuln — appropriately steep)
- Wipe-logs flat reduction (−15 — meaningful but not game-breaking; can be tuned in
  a future pass if Phase 6/7 content shifts the overall trace budget)
