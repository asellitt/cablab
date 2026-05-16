import type { Topology } from '../types/topology'
import { traceCableRun } from './cableTrace'

// Palette index 0 is reserved for 'default'. Remaining slots are assigned to
// named VLANs via a stable string hash so the same VLAN always gets the same
// color regardless of insertion order.
const PALETTE = [
  '#38bdf8', // sky-400    — default
  '#4ade80', // green-400
  '#fb923c', // orange-400
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#facc15', // yellow-400
  '#2dd4bf', // teal-400
  '#f87171', // red-400
  '#818cf8', // indigo-400
  '#34d399', // emerald-400
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i)
  return Math.abs(h)
}

export function vlanColor(vlan: string | undefined): string {
  if (!vlan || vlan === '' || vlan === 'default') return PALETTE[0]
  return PALETTE[1 + (hashStr(vlan) % (PALETTE.length - 1))]
}

// Returns a map of connectionId → vlan string.
//
// For each managed switch port with an explicit VLAN, we trace the full cable
// run from that switch and mark every connection in that run with the VLAN.
// This propagates the VLAN through passthrough ports (patch panels, wall
// panels) all the way to the end device. Connections not reached by any
// managed port's run default to 'default'.
type VlanSource = { entityId: string; portId: string; vlan: string }

function collectVlanSources(topology: Topology): VlanSource[] {
  const sources: VlanSource[] = []
  for (const sw of topology.switches) {
    if (!sw.managed) continue
    for (const port of sw.ports) {
      const v = port.vlan?.trim()
      if (v && v !== 'default') sources.push({ entityId: sw.id, portId: port.id, vlan: v })
    }
  }
  for (const router of topology.routers) {
    for (const port of router.ports) {
      const v = port.vlan?.trim()
      if (v && v !== 'default') sources.push({ entityId: router.id, portId: port.id, vlan: v })
    }
  }
  return sources
}

export function buildConnectionVlanMap(topology: Topology): Map<string, string> {
  const map = new Map<string, string>()

  for (const conn of topology.connections) {
    map.set(conn.id, 'default')
  }

  for (const { entityId, portId, vlan } of collectVlanSources(topology)) {
    const runIds = traceCableRun(topology, entityId)
    const portRunIds = tracePortRun(topology, entityId, portId, runIds)
    for (const id of portRunIds) {
      map.set(id, vlan)
    }
  }

  return map
}

// Given a switch entity + specific port, follows the cable run that starts on
// that port, returning the set of connection IDs belonging to it. Limited to
// the connections already in `universe` (the full switch's traceCableRun) to
// avoid crossing into unrelated runs.
function tracePortRun(
  topology: Topology,
  switchId: string,
  portId: string,
  universe: Set<string>
): Set<string> {
  const result = new Set<string>()
  const visited = new Set<string>()

  function isPassthrough(entityId: string) {
    return (
      topology.patch_panels.some((e) => e.id === entityId) ||
      topology.wall_panels.some((e) => e.id === entityId)
    )
  }

  // Find the first connection from this switch port
  const first = topology.connections.find(
    (c) =>
      universe.has(c.id) &&
      ((c.from.entity_id === switchId && c.from.port_id === portId) ||
       (c.to.entity_id   === switchId && c.to.port_id   === portId))
  )
  if (!first) return result

  type Entry = { connId: string; arrivedAtEntityId: string; arrivedAtPortId: string }
  const queue: Entry[] = [{
    connId: first.id,
    arrivedAtEntityId: first.from.entity_id === switchId ? first.to.entity_id : first.from.entity_id,
    arrivedAtPortId:   first.from.entity_id === switchId ? first.to.port_id   : first.from.port_id,
  }]

  result.add(first.id)

  while (queue.length > 0) {
    const { connId, arrivedAtEntityId, arrivedAtPortId } = queue.shift()!
    if (!isPassthrough(arrivedAtEntityId)) continue

    const visitKey = `${arrivedAtEntityId}:${arrivedAtPortId}`
    if (visited.has(visitKey)) continue
    visited.add(visitKey)

    // Follow the exit from this passthrough port
    const exit = topology.connections.find(
      (c) =>
        universe.has(c.id) &&
        c.id !== connId &&
        !result.has(c.id) &&
        ((c.from.entity_id === arrivedAtEntityId && c.from.port_id === arrivedAtPortId) ||
         (c.to.entity_id   === arrivedAtEntityId && c.to.port_id   === arrivedAtPortId))
    )
    if (!exit) continue

    result.add(exit.id)
    const nextEntityId = exit.from.entity_id === arrivedAtEntityId ? exit.to.entity_id : exit.from.entity_id
    const nextPortId   = exit.from.entity_id === arrivedAtEntityId ? exit.to.port_id   : exit.from.port_id
    queue.push({ connId: exit.id, arrivedAtEntityId: nextEntityId, arrivedAtPortId: nextPortId })
  }

  return result
}

// Returns all distinct VLANs defined on managed switch ports, sorted
// numerically where possible, with 'default' always first.
export function getAllVlans(topology: Topology): string[] {
  const vlans = new Set(collectVlanSources(topology).map((s) => s.vlan))
  const sorted = [...vlans].sort((a, b) => {
    const na = parseInt(a, 10), nb = parseInt(b, 10)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })
  return ['default', ...sorted]
}
