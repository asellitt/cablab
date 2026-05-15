import type { Topology, Connection } from '../types/topology'

const PASSTHROUGH_TYPES = new Set(['patch_panels', 'wall_panels'])

function entityCollectionKey(topology: Topology, entityId: string): string | null {
  for (const key of ['devices', 'switches', 'routers', 'patch_panels', 'wall_panels'] as const) {
    if ((topology[key] as { id: string }[]).some((e) => e.id === entityId)) return key
  }
  return null
}

function isPassthrough(topology: Topology, entityId: string): boolean {
  const key = entityCollectionKey(topology, entityId)
  return key !== null && PASSTHROUGH_TYPES.has(key)
}

// Returns the IDs of all connections that form the cable run from startEntityId.
//
// At the starting entity we follow ALL ports (it may have multiple).
// At each passthrough we follow exactly ONE exit — the connection that is NOT
// the one we arrived through. When there is ambiguity (a port has multiple
// candidates because of a misconfigured topology), we prefer a connection
// leading to a terminal (device/switch/router) over one leading to another
// passthrough. This prevents bleeding into sibling runs that happen to share
// the same patch-panel port ID.
export function traceCableRun(topology: Topology, startEntityId: string): Set<string> {
  const result = new Set<string>()

  type QueueEntry = { entityId: string; portId: string | null; fromConnId: string | null }
  const queue: QueueEntry[] = [{ entityId: startEntityId, portId: null, fromConnId: null }]
  const visited = new Set<string>()

  function remoteOf(conn: Connection, entityId: string) {
    return conn.from.entity_id === entityId
      ? { id: conn.to.entity_id, portId: conn.to.port_id }
      : { id: conn.from.entity_id, portId: conn.from.port_id }
  }

  while (queue.length > 0) {
    const { entityId, portId, fromConnId } = queue.shift()!

    if (fromConnId === null) {
      // Starting entity: follow ALL connections on all ports.
      for (const conn of topology.connections) {
        const matches =
          conn.from.entity_id === entityId || conn.to.entity_id === entityId
        if (!matches || result.has(conn.id)) continue

        result.add(conn.id)
        const remote = remoteOf(conn, entityId)
        if (!isPassthrough(topology, remote.id)) continue

        const visitKey = `${remote.id}:${remote.portId}`
        if (visited.has(visitKey)) continue
        visited.add(visitKey)
        queue.push({ entityId: remote.id, portId: remote.portId, fromConnId: conn.id })
      }
    } else {
      // Passthrough node: find exactly ONE exit on this port.
      // Skip the connection we came from. Prefer exits to terminals over exits
      // to other passthroughs so that a stray cross-connection on the same
      // patch-panel port doesn't bleed into an unrelated run.
      const candidates = topology.connections.filter((conn) => {
        const fromMatch = conn.from.entity_id === entityId && conn.from.port_id === portId
        const toMatch   = conn.to.entity_id   === entityId && conn.to.port_id   === portId
        return (fromMatch || toMatch) && conn.id !== fromConnId && !result.has(conn.id)
      })

      const terminalExit    = candidates.find((c) => !isPassthrough(topology, remoteOf(c, entityId).id))
      const passthroughExit = candidates.find((c) =>  isPassthrough(topology, remoteOf(c, entityId).id))
      const exit            = terminalExit ?? passthroughExit

      if (exit) {
        result.add(exit.id)
        const remote = remoteOf(exit, entityId)
        if (isPassthrough(topology, remote.id)) {
          const visitKey = `${remote.id}:${remote.portId}`
          if (!visited.has(visitKey)) {
            visited.add(visitKey)
            queue.push({ entityId: remote.id, portId: remote.portId, fromConnId: exit.id })
          }
        }
      }
    }
  }

  return result
}
