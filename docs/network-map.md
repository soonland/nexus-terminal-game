# Network Map

Visual overview of the 16 anchor nodes across 6 layers.

```mermaid
graph TD
    subgraph L0["Layer 0 — Entry (DMZ)"]
        contractor_portal["🌐 CONTRACTOR PORTAL\n10.0.0.1"]
        vpn_gateway["🔀 VPN GATEWAY\n10.0.0.2"]
    end

    subgraph L1["Layer 1 — Operations"]
        ops_cctv_ctrl["📷 CCTV CONTROLLER\n10.1.0.1"]
        ops_hr_db["🗃️ HR DATABASE\n10.1.0.2"]
    end

    subgraph L2["Layer 2 — Security"]
        sec_access_ctrl["🔐 ACCESS CONTROL\n10.2.0.1"]
        sec_firewall["🛡️ PERIMETER FIREWALL\n10.2.0.2"]
    end

    subgraph L3["Layer 3 — Finance"]
        fin_payments_db["💳 PAYMENTS DATABASE\n10.3.0.1"]
        fin_exec_accounts["💰 EXEC ACCOUNTS\n10.3.0.2"]
    end

    subgraph L4["Layer 4 — Executive"]
        exec_cfo["🖥️ CFO WORKSTATION\n10.4.0.1"]
        exec_legal["📁 LEGAL FILE SERVER\n10.4.0.2"]
        exec_ceo["💀 CEO TERMINAL\n10.4.0.3"]
    end

    subgraph L5["Layer 5 — Aria Subnetwork"]
        aria_surveillance["👁️ ARIA SURVEILLANCE\n172.16.0.1"]
        aria_behavioural["🧠 ARIA BEHAVIOURAL\n172.16.0.2"]
        aria_personnel["👤 ARIA PERSONNEL\n172.16.0.3"]
        aria_core["⚡ ARIA CORE\n172.16.0.4"]
        aria_decision["🎯 ARIA DECISION\n172.16.0.5"]
    end

    contractor_portal --> vpn_gateway
    vpn_gateway --> ops_cctv_ctrl
    vpn_gateway --> ops_hr_db
    ops_cctv_ctrl --> ops_hr_db
    ops_hr_db --> sec_access_ctrl
    sec_access_ctrl --> sec_firewall
    sec_firewall --> fin_payments_db
    sec_firewall --> fin_exec_accounts
    fin_payments_db --> fin_exec_accounts
    fin_exec_accounts --> exec_cfo
    exec_cfo --> exec_legal
    exec_legal --> exec_ceo
    exec_ceo --> aria_surveillance
    aria_surveillance --> aria_behavioural
    aria_surveillance --> aria_personnel
    aria_behavioural --> aria_personnel
    aria_behavioural --> aria_core
    aria_personnel --> aria_core
    aria_core --> aria_decision
```

Edges show forward progression (entry → exit direction). Connections are bidirectional in the game engine.
The `exec_ceo → aria_surveillance` edge is gated by `aria_key.bin` (Layer 5 unlock).
