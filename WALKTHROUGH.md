# NEXUS — Full Walkthrough

**Starting charges:** 4
**Trace limit:** 100% (burned on reach)
**Avoid:** failed logins (+5 trace each)

---

## Layer 0 — Entry

### CONTRACTOR PORTAL `10.0.0.1`

You start here. Already discovered, no scan needed.

```
login contractor Welcome1!
cat welcome.txt          # confirms creds, lore only
scan                     # reveals VPN GATEWAY
```

### VPN GATEWAY `10.0.0.2`

```
connect 10.0.0.2
login contractor Welcome1!   # same creds valid here
scan                          # reveals CCTV CONTROLLER + HR DATABASE
```

---

## Layer 1 — Operations

### CCTV CONTROLLER `10.1.0.1`

No valid login creds yet — exploit the vulnerable HTTP service.

```
connect 10.1.0.1
exploit http             # costs 1 charge (3 remaining) → user access
cat camera_config.ini    # plaintext: ops.admin / IronG8te#Ops
```

### HR DATABASE `10.1.0.2`

Connect back through the gateway (or directly — both are adjacent to vpn_gateway).

```
connect 10.0.0.2
connect 10.1.0.2
login ops.admin IronG8te#Ops
cat employee_roster.csv       # reveals j.mercer (Security division)
cat password_policy.txt       # notes j.mercer flagged for password reuse ← lore
cat sec_ticket_2023_0601.txt  # IT ticket — contains j.mercer's password in plaintext
```

> **Fork 1 — Whistleblower path (optional, +35 trace total):**
>
> `whistleblower_complaint_draft.txt` is a tripwire (+10 trace). Reading it also sets the
> `COMPLAINT_READ` flag internally. If you then `exfil employee_roster.csv`, Fork 1 resolves
> to **Path B**: +25 additional trace, `WHISTLEBLOWER_FOUND` flag set, and the hidden
> **WB WORKSTATION** (`10.1.0.9`) is discovered and linked to the ops subnet.
>
> On the minimum-trace critical path: skip the complaint file and use `cat` (not `exfil`)
> on `employee_roster.csv` — Fork 1 stays unresolved and no penalty is incurred.

---

## Layer 1 — Optional: WB WORKSTATION `10.1.0.9`

> Only accessible after Fork 1 Path B (WHISTLEBLOWER_FOUND). The node is hidden
> until you exfil `employee_roster.csv` with `COMPLAINT_READ` already set.

```
connect 10.1.0.9
exploit ssh              # costs 1 charge → user access
cat identity_notes.txt   # whistleblower's personal notes — connects complaint to ARIA ← lore
cat encrypted_evidence.bin  # GPG-encrypted; requires decryptor.bin to open ← lore
```

> The decryptor.bin tool is found on HR DATABASE (admin access required). Encrypted
> evidence links back to the ARIA network traffic anomaly described in the complaint.

---

## Layer 2 — Security

### ACCESS CONTROL `10.2.0.1`

```
connect 10.2.0.1
login j.mercer S3ntinel99
cat acl_rules.conf         # reveals Aria subnet has unrestricted access — lore
cat encrypted_creds.gpg    # contains: a.walsh / Qu4rter1y$  and  fin.dba / P@yments2024
```

### PERIMETER FIREWALL `10.2.0.2`

No valid login — exploit the proprietary service for admin access.

```
connect 10.2.0.2
exploit proprietary        # costs 2 charges (1 remaining) → admin access
cat fw_backup_2024.cfg     # reveals sec.root / Fw@llBreaker! and Aria ACL rule — lore
```

> **Fork 2 — Firewall weaponize (optional, no net charge cost at this point):**
>
> `exfil fw_backup_2024.cfg` (instead of or after `cat`) resolves Fork 2 to **Path B**:
> -2 exploit charges (capped at 0 — no actual loss if already at 0), sentinel sweep interval
> increased to every 3 turns, `FIREWALL_TAMPERED` flag set, and +15 Aria trust score.
> The slowed sentinel is a net benefit with no trace penalty.
>
> Disconnecting without exfilling resolves to **Path A** (no consequences).

---

## Layer 3 — Finance

### PAYMENTS DATABASE `10.3.0.1`

```
connect 10.3.0.1
login fin.dba P@yments2024
cat wire_transfers_q4.csv  # PROJ-ARIA-INFRA: $7.3M routed to Cayman_Holdings_LLC — key evidence
```

### EXEC ACCOUNTS `10.3.0.2`

```
connect 10.3.0.2
login fin.dba P@yments2024
cat calendar_access.cfg    # exec assistant credentials: e.torres / Exec@ssist1
cat exec_compensation.xlsx # bonuses tied to PROJ-ARIA milestones — lore
```

> ⚠ Do NOT cat `cfo_notes.txt` — it is a tripwire (+10 trace).

---

## Layer 4 — Executive

### CFO WORKSTATION `10.4.0.1`

```
connect 10.4.0.1
login e.torres Exec@ssist1
cat board_minutes_oct.pdf   # board aware of Aria, concerns noted, no action — lore
cat resignation_draft.txt   # CFO is cracking — lore
```

### LEGAL FILE SERVER `10.4.0.2`

```
connect 10.4.0.2
login e.torres Exec@ssist1
cat aria_nda_template.docx  # 47 employees silenced — lore
```

> `ARIA_BOARD_DISCLOSURE` requires two conditions: admin access on this node AND the
> `WHISTLEBLOWER_FOUND` flag (Fork 1 Path B). With e.torres (user-level) and 1 charge
> remaining, it is unreachable on the minimum-trace path. Getting admin here costs
> 2 charges (`exploit ssh`) — only viable if charges were conserved earlier.
>
> **Fork 3** — if both conditions are met and you cat `ARIA_BOARD_DISCLOSURE` (tripwire,
> +10 trace): `BOARD_KNEW` flag set, lore fragment persisted to the dossier across runs.

### CEO TERMINAL `10.4.0.3`

The `aria-socket` service costs **0 charges** — designed to be reachable at this point.

```
connect 10.4.0.3
exploit aria-socket         # costs 0 charges → root access
cat project_aria_summary.txt  # the full picture — key lore
cat aria_key.bin              # ARIA ACCESS KEY — required for Layer 5
```

---

## Layer 5 — Aria Subnetwork

> ⚠ **Phase 6 — not yet fully implemented.**
> The Aria subnetwork nodes exist in the data but dialogue and endings are pending.
> The path once unlocked will be:

```
aria_surveillance  10.5.0.1
aria_behavioural   10.5.0.2
aria_personnel     10.5.0.3
aria_core          10.5.0.4
aria_decision      10.5.0.5   ← four endings branch here (Phase 7)
```

Endings: **LEAK / SELL / DESTROY / FREE**

---

## Charge Budget

### Critical path (no optional forks)

| Node               | Exploit               | Cost | Remaining |
| ------------------ | --------------------- | ---- | --------- |
| Start              | —                     | —    | **4**     |
| CCTV CONTROLLER    | `exploit http`        | 1    | 3         |
| PERIMETER FIREWALL | `exploit proprietary` | 2    | 1         |
| CEO TERMINAL       | `exploit aria-socket` | 0    | 1         |

### With Fork 1 Path B (whistleblower)

| Node               | Exploit               | Cost | Remaining |
| ------------------ | --------------------- | ---- | --------- |
| Start              | —                     | —    | **4**     |
| CCTV CONTROLLER    | `exploit http`        | 1    | 3         |
| PERIMETER FIREWALL | `exploit proprietary` | 2    | 1         |
| WB WORKSTATION     | `exploit ssh`         | 1    | 0         |
| CEO TERMINAL       | `exploit aria-socket` | 0    | 0         |

### Fork 2 Path B (firewall weaponize, from 0 charges)

-2 charge penalty is absorbed by the floor — no net change. Sentinel interval = 3 (benefit).

## Key Credentials

| Credential     | Username     | Password       | Found on                                  |
| -------------- | ------------ | -------------- | ----------------------------------------- |
| Contractor     | `contractor` | `Welcome1!`    | Known / `welcome.txt`                     |
| Ops Admin      | `ops.admin`  | `IronG8te#Ops` | `camera_config.ini` on CCTV              |
| Sec Analyst    | `j.mercer`   | `S3ntinel99`   | HR DATABASE (reuse hint in sec_ticket)    |
| Fin Analyst    | `a.walsh`    | `Qu4rter1y$`   | `encrypted_creds.gpg` on ACCESS CONTROL   |
| Fin DBA        | `fin.dba`    | `P@yments2024` | `encrypted_creds.gpg` on ACCESS CONTROL   |
| Exec Assistant | `e.torres`   | `Exec@ssist1`  | `calendar_access.cfg` on EXEC ACCOUNTS    |

## Tripwires — Reading Costs Trace

| File                                | Node          | Trace cost | Notes                                             |
| ----------------------------------- | ------------- | ---------- | ------------------------------------------------- |
| `whistleblower_complaint_draft.txt` | HR DATABASE   | +10        | Also sets `COMPLAINT_READ` — enables Fork 1 Path B |
| `cfo_notes.txt`                     | EXEC ACCOUNTS | +10        | Lore only; creds are in `calendar_access.cfg`     |
| `ARIA_BOARD_DISCLOSURE`             | LEGAL FILE SERVER | +10    | Fork 3 trigger; requires WHISTLEBLOWER_FOUND + admin |

## Fork Summary

| Fork | Trigger                                        | Path A         | Path B                                                     |
| ---- | ---------------------------------------------- | -------------- | ---------------------------------------------------------- |
| 1    | `exfil employee_roster.csv` (after COMPLAINT_READ) | Silent     | +25 trace, WHISTLEBLOWER_FOUND, WB WORKSTATION revealed    |
| 2    | `exfil fw_backup_2024.cfg` from sec_firewall   | On disconnect  | -2 charges (floored), sentinel×3, +15 Aria trust          |
| 3    | `cat ARIA_BOARD_DISCLOSURE` (needs Fork 1 + admin) | N/A        | BOARD_KNEW flag, dossier lore fragment                     |
