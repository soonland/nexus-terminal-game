import { GameState, CommandOutput, hasAccess, AccessLevel } from '../types/game'
import { currentNode, addTrace } from './state'
import produce from './produce'

type Out = CommandOutput['lines']
const line  = (content: string, type: CommandOutput['lines'][0]['type'] = 'system') =>
  ({ type, content })
const out   = (content: string) => line(content, 'output')
const sys   = (content: string) => line(content, 'system')
const err   = (content: string) => line(content, 'error')
const sep   = ()                => line('', 'separator')

// ── Command resolution ─────────────────────────────────────
export function resolveCommand(
  raw: string,
  state: GameState,
): CommandOutput {
  if (state.phase === 'burned') {
    return {
      lines: [err('SESSION TERMINATED — trace limit reached. Restarting...')],
    }
  }

  const [cmd, ...args] = raw.trim().split(/\s+/)
  const verb = cmd?.toLowerCase() ?? ''

  // ── Local commands (no trace, no state change) ───────────
  switch (verb) {
    case 'help':    return cmdHelp()
    case 'status':  return cmdStatus(state)
    case 'inventory': return cmdInventory(state)
    case 'map':     return cmdMap(state)
    case 'clear':   return { lines: [], nextState: undefined }
  }

  // ── Engine commands ──────────────────────────────────────
  switch (verb) {
    case 'scan':       return cmdScan(args, state)
    case 'connect':    return cmdConnect(args, state)
    case 'login':      return cmdLogin(args, state)
    case 'ls':         return cmdLs(args, state)
    case 'cat':        return cmdCat(args, state)
    case 'disconnect': return cmdDisconnect(state)
    case 'exploit':    return cmdExploit(args, state)
    case 'exfil':      return cmdExfil(args, state)
    case 'wipe-logs':  return cmdWipeLogs(state)
  }

  // ── Unknown → will be AI-routed in Phase 3 ───────────────
  return {
    lines: [
      sys(`[routing to AI handler — not yet implemented]`),
      err(`Unknown command: ${verb}`),
    ],
  }
}

// ── help ──────────────────────────────────────────────────
function cmdHelp(): CommandOutput {
  return {
    lines: [
      sep(),
      out('LOCAL COMMANDS (no trace):'),
      sys('  help          — this message'),
      sys('  status        — session overview'),
      sys('  inventory     — credentials, tools, exfils'),
      sys('  map           — discovered network nodes'),
      sys('  clear         — clear terminal'),
      sep(),
      out('ENGINE COMMANDS:'),
      sys('  scan                — scan current subnet (+1 trace)'),
      sys('  scan [ip]           — probe a specific node (+1 trace)'),
      sys('  connect [ip]        — connect to a node'),
      sys('  login [user] [pass] — authenticate (+5 trace on fail)'),
      sys('  ls [path]           — list files'),
      sys('  cat [filepath]      — read a file'),
      sys('  disconnect          — return to previous node'),
      sys('  exploit [service]   — exploit a service (costs charges)'),
      sys('  exfil [filepath]    — copy file to inventory (+3 trace)'),
      sys('  wipe-logs           — clear traces (requires log-wiper)'),
      sep(),
    ],
  }
}

// ── status ────────────────────────────────────────────────
function cmdStatus(state: GameState): CommandOutput {
  const node = currentNode(state)
  const { player } = state
  const traceColor = player.trace <= 30 ? 'SAFE' :
                     player.trace <= 60 ? 'ELEVATED' :
                     player.trace <= 85 ? 'SENTINEL ACTIVE' : 'CRITICAL'
  return {
    lines: [
      sep(),
      sys(`Handle  : ${player.handle}`),
      sys(`Node    : ${node.ip}  (${node.label})`),
      sys(`Access  : ${node.accessLevel.toUpperCase()}`),
      sys(`Trace   : ${player.trace}%  [${traceColor}]`),
      sys(`Charges : ${player.charges}`),
      sys(`Tools   : ${player.tools.map(t => t.id).join(', ') || 'none'}`),
      sep(),
    ],
  }
}

// ── inventory ─────────────────────────────────────────────
function cmdInventory(state: GameState): CommandOutput {
  const { player } = state
  const obtained = player.credentials.filter(c => c.obtained)
  const lines: Out = [sep()]

  if (obtained.length === 0) {
    lines.push(sys('Credentials : none'))
  } else {
    lines.push(out('CREDENTIALS:'))
    obtained.forEach(c =>
      lines.push(sys(`  ${c.username} / ${c.password}  [${c.accessLevel}]  — ${c.validOnNodes.join(', ')}`))
    )
  }

  lines.push(sep())

  if (player.exfiltrated.length === 0) {
    lines.push(sys('Exfiltrated : none'))
  } else {
    lines.push(out('EXFILTRATED:'))
    player.exfiltrated.forEach(f =>
      lines.push(sys(`  ${f.path}`))
    )
  }

  lines.push(sep())
  return { lines }
}

// ── map ───────────────────────────────────────────────────
function cmdMap(state: GameState): CommandOutput {
  const { nodes, currentNodeId } = state.network
  const discovered = Object.values(nodes).filter(n => n.discovered)
  const lines: Out = [sep(), out('NETWORK MAP:')]

  const byLayer = [0, 1, 2, 3, 4, 5]
  byLayer.forEach(layer => {
    const layerNodes = discovered.filter(n => n.layer === layer)
    if (layerNodes.length === 0) return
    const labels = ['ENTRY', 'OPS', 'SECURITY', 'FINANCE', 'EXECUTIVE', 'ARIA']
    lines.push(sys(`  [L${layer}] ${labels[layer] ?? ''}`))
    layerNodes.forEach(n => {
      const current = n.id === currentNodeId ? ' ◄' : ''
      const access  = n.accessLevel !== 'none' ? ` [${n.accessLevel.toUpperCase()}]` : ''
      lines.push(sys(`      ${n.ip}  ${n.label}${access}${current}`))
    })
  })

  lines.push(sep())
  return { lines }
}

// ── scan ──────────────────────────────────────────────────
function cmdScan(args: string[], state: GameState): CommandOutput {
  let next = addTrace(state, 1)
  const lines: Out = []

  if (args[0]) {
    // scan specific IP
    const target = Object.values(state.network.nodes).find(n => n.ip === args[0])
    if (!target) {
      return { lines: [err(`No response from ${args[0]}`)] }
    }
    if (!target.discovered) {
      next = produce(next, s => { s.network.nodes[target.id]!.discovered = true })
    }
    lines.push(out(`Scanning ${target.ip}...`))
    lines.push(sys(`  Host    : ${target.label}`))
    lines.push(sys(`  Layer   : ${target.layer}`))
    lines.push(sys(`  Status  : ${target.compromised ? 'COMPROMISED' : 'ACTIVE'}`))
    lines.push(sys('  Services:'))
    target.services.forEach(svc => {
      const vuln = svc.vulnerable && !svc.patched ? '  [VULNERABLE]' : ''
      lines.push(sys(`    ${svc.port}/tcp  ${svc.name}${vuln}`))
    })
  } else {
    // scan current subnet
    const node = currentNode(state)
    lines.push(out(`Scanning subnet (layer ${node.layer})...`))
    const peers = node.connections.map(id => state.network.nodes[id]).filter(Boolean)
    peers.forEach(peer => {
      if (peer) {
        next = produce(next, s => { s.network.nodes[peer.id]!.discovered = true })
        const vuln = peer.services.some(s => s.vulnerable && !s.patched) ? '  [!]' : ''
        lines.push(sys(`  ${peer.ip}  ${peer.label}${vuln}`))
      }
    })
    if (peers.length === 0) lines.push(sys('  No peers found.'))
  }

  return { lines, nextState: next }
}

// ── connect ───────────────────────────────────────────────
function cmdConnect(args: string[], state: GameState): CommandOutput {
  if (!args[0]) return { lines: [err('Usage: connect [ip]')] }

  const target = Object.values(state.network.nodes).find(n => n.ip === args[0])
  if (!target) return { lines: [err(`Host not found: ${args[0]}`)] }
  if (!target.discovered) return { lines: [err(`No route to ${args[0]} — try scanning first`)] }

  const node = currentNode(state)
  if (!node.connections.includes(target.id)) {
    return { lines: [err(`No direct route from ${node.ip} to ${target.ip}`)] }
  }

  const next = produce(state, s => {
    s.network.previousNodeId = s.network.currentNodeId
    s.network.currentNodeId  = target.id
  })

  return {
    lines: [
      out(`Connecting to ${target.ip}...`),
      sys(`  ${target.label}`),
      sys(`  ${target.description}`),
      sys(`  Access: ${target.accessLevel === 'none' ? 'NONE — authenticate to proceed' : target.accessLevel.toUpperCase()}`),
    ],
    nextState: next,
  }
}

// ── login ─────────────────────────────────────────────────
function cmdLogin(args: string[], state: GameState): CommandOutput {
  if (args.length < 2) return { lines: [err('Usage: login [username] [password]')] }
  const [username, password] = args

  const node = currentNode(state)
  const match = state.player.credentials.find(
    c => c.username === username &&
         c.password === password &&
         c.validOnNodes.includes(node.id)
  )

  if (!match) {
    const next = addTrace(state, 5)
    return {
      lines: [err(`Authentication failed. (+5 trace)`)],
      nextState: next,
    }
  }

  // Grant access and mark credential as obtained
  const next = produce(state, s => {
    s.network.nodes[node.id]!.accessLevel = match.accessLevel
    const cred = s.player.credentials.find(c => c.id === match.id)
    if (cred) cred.obtained = true
  })

  return {
    lines: [
      out(`Authenticated as ${username}.`),
      sys(`  Access level: ${match.accessLevel.toUpperCase()}`),
    ],
    nextState: next,
  }
}

// ── ls ────────────────────────────────────────────────────
function cmdLs(args: string[], state: GameState): CommandOutput {
  const node = currentNode(state)
  if (node.accessLevel === 'none') {
    return { lines: [err('Permission denied — not authenticated')] }
  }

  const path = args[0] ?? '/'
  const accessible = node.files.filter(f => hasAccess(node.accessLevel, f.accessRequired))

  if (accessible.length === 0) {
    return { lines: [sys(`${path}: no accessible files`)] }
  }

  const lines: Out = [sys(`${path}:`)]
  accessible.forEach(f => {
    const tripwire = f.tripwire ? '  [!]' : ''
    const exfil    = f.exfiltrable ? '' : '  [no-exfil]'
    lines.push(sys(`  ${f.name}${tripwire}${exfil}`))
  })
  return { lines }
}

// ── cat ───────────────────────────────────────────────────
function cmdCat(args: string[], state: GameState): CommandOutput {
  if (!args[0]) return { lines: [err('Usage: cat [filepath]')] }

  const node = currentNode(state)
  if (node.accessLevel === 'none') {
    return { lines: [err('Permission denied — not authenticated')] }
  }

  const file = node.files.find(
    f => f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`)
  )
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] }
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] }
  }

  let next = state
  if (file.tripwire) {
    next = addTrace(state, 10)
  }

  if (file.content === null) {
    return {
      lines: [sys('[AI content generation — available in Phase 3]')],
      nextState: next,
    }
  }

  const lines: Out = [sep()]
  file.content.split('\n').forEach(l => lines.push(out(l)))
  lines.push(sep())

  return { lines, nextState: next }
}

// ── disconnect ────────────────────────────────────────────
function cmdDisconnect(state: GameState): CommandOutput {
  const prev = state.network.previousNodeId
  if (!prev) {
    return { lines: [err('No previous node to return to.')] }
  }

  const prevNode = state.network.nodes[prev]!
  const next = produce(state, s => {
    s.network.currentNodeId  = prev
    s.network.previousNodeId = null
  })

  return {
    lines: [sys(`Disconnected. Returning to ${prevNode.ip} (${prevNode.label}).`)],
    nextState: next,
  }
}

// ── exploit ───────────────────────────────────────────────
function cmdExploit(args: string[], state: GameState): CommandOutput {
  if (!args[0]) return { lines: [err('Usage: exploit [service]')] }

  const hasTool = state.player.tools.some(t => t.id === 'exploit-kit')
  if (!hasTool) return { lines: [err('exploit-kit tool required')] }

  const node    = currentNode(state)
  const service = args[0].toLowerCase()
  const svc     = node.services.find(s => s.name === service)

  if (!svc) return { lines: [err(`Service not found on ${node.ip}: ${service}`)] }
  if (svc.patched) return { lines: [err(`${service}: patched — exploit unavailable`)] }
  if (!svc.vulnerable) return { lines: [err(`${service}: no known vulnerability`)] }

  if (state.player.charges < svc.exploitCost) {
    return { lines: [err(`Insufficient charges (need ${svc.exploitCost}, have ${state.player.charges})`)] }
  }

  const next = produce(addTrace(state, 2), s => {
    s.player.charges -= svc.exploitCost
    s.network.nodes[node.id]!.accessLevel  = svc.accessGained as AccessLevel
    s.network.nodes[node.id]!.compromised  = true
  })

  return {
    lines: [
      out(`Exploiting ${service} on ${node.ip}...`),
      sys(`  Vulnerability confirmed.`),
      sys(`  Access gained: ${svc.accessGained.toUpperCase()}`),
      sys(`  Charges remaining: ${next.player.charges}`),
    ],
    nextState: next,
  }
}

// ── exfil ─────────────────────────────────────────────────
function cmdExfil(args: string[], state: GameState): CommandOutput {
  if (!args[0]) return { lines: [err('Usage: exfil [filepath]')] }

  const node = currentNode(state)
  if (node.accessLevel === 'none') return { lines: [err('Not authenticated')] }

  const file = node.files.find(
    f => f.name === args[0] || f.path === args[0] || f.path.endsWith(`/${args[0]}`)
  )
  if (!file) return { lines: [err(`File not found: ${args[0]}`)] }
  if (!file.exfiltrable) return { lines: [err(`${file.name}: exfiltration blocked`)] }
  if (!hasAccess(node.accessLevel, file.accessRequired)) {
    return { lines: [err(`Permission denied: ${file.name}`)] }
  }

  const already = state.player.exfiltrated.some(f => f.path === file.path)
  if (already) return { lines: [sys(`Already exfiltrated: ${file.name}`)] }

  const next = produce(addTrace(state, 3), s => {
    s.player.exfiltrated.push({ ...file })
  })

  return {
    lines: [
      out(`Exfiltrating ${file.name}... done.`),
      sys(`  +3 trace`),
    ],
    nextState: next,
  }
}

// ── wipe-logs ─────────────────────────────────────────────
function cmdWipeLogs(state: GameState): CommandOutput {
  const hasTool = state.player.tools.some(t => t.id === 'log-wiper')
  if (!hasTool) return { lines: [err('log-wiper tool required')] }

  const reduction = 15
  const next = produce(state, s => {
    s.player.trace = Math.max(0, s.player.trace - reduction)
  })

  return {
    lines: [
      out('Wiping logs...'),
      sys(`  Trace reduced by ${reduction}%. Now: ${next.player.trace}%`),
    ],
    nextState: next,
  }
}
