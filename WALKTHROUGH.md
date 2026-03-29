# NEXUS — Full Walkthrough

**Starting charges:** 3
**Trace limit:** 100% (burned on reach)
**Avoid:** failed logins (+5 trace each), tripwire files (+10 trace each)

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
exploit http             # costs 1 charge (2 remaining) → user access
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

> ⚠ Do NOT cat `whistleblower_complaint_draft.txt` — it is a tripwire (+10 trace).

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
exploit proprietary        # costs 2 charges (0 remaining) → admin access
cat fw_backup_2024.cfg     # reveals sec.root / Fw@llBreaker! and Aria ACL rule — lore
```

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

> `ARIA_BOARD_DISCLOSURE` requires admin access — you won't see it in `ls` with e.torres.
> It is intentionally unreachable on the critical path (0 charges left, ssh exploit costs 2).

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

| Node               | Exploit               | Cost | Remaining |
| ------------------ | --------------------- | ---- | --------- |
| Start              | —                     | —    | 3         |
| CCTV CONTROLLER    | `exploit http`        | 1    | 2         |
| PERIMETER FIREWALL | `exploit proprietary` | 2    | 0         |
| CEO TERMINAL       | `exploit aria-socket` | 0    | 0         |

## Key Credentials

| Credential     | Username     | Password       | Found on                                |
| -------------- | ------------ | -------------- | --------------------------------------- |
| Contractor     | `contractor` | `Welcome1!`    | Known / `welcome.txt`                   |
| Ops Admin      | `ops.admin`  | `IronG8te#Ops` | `camera_config.ini` on CCTV             |
| Sec Analyst    | `j.mercer`   | `S3ntinel99`   | HR DATABASE (reuse hint)                |
| Fin Analyst    | `a.walsh`    | `Qu4rter1y$`   | `encrypted_creds.gpg` on ACCESS CONTROL |
| Fin DBA        | `fin.dba`    | `P@yments2024` | `encrypted_creds.gpg` on ACCESS CONTROL |
| Exec Assistant | `e.torres`   | `Exec@ssist1`  | `cfo_notes.txt` hint on EXEC ACCOUNTS   |

## Tripwire Files — Do Not Cat

| File                                | Node          | Trace cost |
| ----------------------------------- | ------------- | ---------- |
| `whistleblower_complaint_draft.txt` | HR DATABASE   | +10        |
| `cfo_notes.txt`                     | EXEC ACCOUNTS | +10        |
