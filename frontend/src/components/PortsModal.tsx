import React, { useState } from 'react'
import { X, PlugZap } from 'lucide-react'
import type { Topology, AnyEntity, Port, PassthroughPort } from '../types/topology'
import { getPorts, isPassthroughEntity, getEntity } from './ConnectionForm'
import { saveTopology } from '../api/client'

interface PortsModalProps {
  entityId: string
  topology: Topology
  onSaved: (topology: Topology) => void
  onClose: () => void
}

const COLS = 12

function portIdComparator(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  if (!isNaN(na)) return -1
  if (!isNaN(nb)) return 1
  return a.localeCompare(b)
}

function connectedEntityName(
  topology: Topology,
  entityId: string,
  portId: string,
  side: string | undefined,
): string | null {
  for (const conn of topology.connections) {
    const fromMatch = conn.from.entity_id === entityId && conn.from.port_id === portId && conn.from.side === side
    const toMatch   = conn.to.entity_id   === entityId && conn.to.port_id   === portId && conn.to.side   === side
    if (!fromMatch && !toMatch) continue
    const otherId = fromMatch ? conn.to.entity_id : conn.from.entity_id
    return getEntity(topology, otherId)?.name ?? otherId
  }
  return null
}

function passthroughConnections(
  topology: Topology,
  entityId: string,
  portId: string,
): [string | null, string | null] {
  return [
    connectedEntityName(topology, entityId, portId, 'back'),
    connectedEntityName(topology, entityId, portId, 'front'),
  ]
}

function isPassthroughPortPoe(topology: Topology, entityId: string, portId: string): boolean {
  for (const side of ['front', 'back']) {
    for (const conn of topology.connections) {
      const fromMatch = conn.from.entity_id === entityId && conn.from.port_id === portId && conn.from.side === side
      const toMatch   = conn.to.entity_id   === entityId && conn.to.port_id   === portId && conn.to.side   === side
      if (!fromMatch && !toMatch) continue
      const otherEp     = fromMatch ? conn.to : conn.from
      const otherEntity = getEntity(topology, otherEp.entity_id)
      if (!otherEntity) continue
      const port = (getPorts(otherEntity) as Port[]).find((p) => p.id === otherEp.port_id)
      if (port?.poe) return true
    }
  }
  return false
}

// Swap all connections on portA with portB for the given entity.
function swapPorts(topology: Topology, entityId: string, portA: string, portB: string): Topology {
  return {
    ...topology,
    connections: topology.connections.map((conn) => {
      let from = { ...conn.from }
      let to   = { ...conn.to }
      if (from.entity_id === entityId) {
        if (from.port_id === portA) from = { ...from, port_id: portB }
        else if (from.port_id === portB) from = { ...from, port_id: portA }
      }
      if (to.entity_id === entityId) {
        if (to.port_id === portA) to = { ...to, port_id: portB }
        else if (to.port_id === portB) to = { ...to, port_id: portA }
      }
      return { ...conn, from, to }
    }),
  }
}

// Move portA's connections to an empty slot (newPortId), creating the port
// definition by copying portA's type/standard, then removing portA.
function movePort(topology: Topology, entityId: string, srcPortId: string, newPortId: string): Topology {
  const entity = getEntity(topology, entityId)
  if (!entity) return topology

  const isPass  = isPassthroughEntity(topology, entityId)
  const srcPort = (getPorts(entity) as (Port | PassthroughPort)[]).find((p) => p.id === srcPortId)
  if (!srcPort) return topology

  // Create the new port definition
  const newPort: Port | PassthroughPort = { ...srcPort, id: newPortId }

  // Add the new port and remove the old one from the entity
  function updatePorts<T extends { id: string }>(ports: T[]): T[] {
    return [...ports.filter((p) => p.id !== srcPortId), newPort as T]
  }

  let updated: Topology = {
    ...topology,
    devices:      topology.devices.map((e)      => e.id !== entityId ? e : { ...e, ports: updatePorts(e.ports) }),
    switches:     topology.switches.map((e)     => e.id !== entityId ? e : { ...e, ports: updatePorts(e.ports) }),
    routers:      topology.routers.map((e)      => e.id !== entityId ? e : { ...e, ports: updatePorts(e.ports) }),
    patch_panels: topology.patch_panels.map((e) => e.id !== entityId ? e : { ...e, ports: updatePorts(e.ports as PassthroughPort[]) }),
    wall_panels:  topology.wall_panels.map((e)  => e.id !== entityId ? e : { ...e, ports: updatePorts(e.ports as PassthroughPort[]) }),
  }

  // Remap all connections from srcPortId to newPortId (no swap needed since target is empty)
  updated = {
    ...updated,
    connections: updated.connections.map((conn) => ({
      ...conn,
      from: conn.from.entity_id === entityId && conn.from.port_id === srcPortId
        ? { ...conn.from, port_id: newPortId } : conn.from,
      to: conn.to.entity_id === entityId && conn.to.port_id === srcPortId
        ? { ...conn.to, port_id: newPortId } : conn.to,
    })),
  }

  return updated
}

// ---------------------------------------------------------------------------
// Grid builders
// ---------------------------------------------------------------------------

type PassthroughCell = { portId: string | null; back: string | null; front: string | null; poe: boolean }
type TerminalCell    = { portId: string; label?: string; poe: boolean; connected: string | null }

function buildPassthroughGrid(entity: AnyEntity, topology: Topology): PassthroughCell[][] {
  const ports = getPorts(entity) as PassthroughPort[]
  if (ports.length === 0) return []
  const sorted     = [...ports].sort((a, b) => portIdComparator(a.id, b.id))
  const allNumeric = sorted.every((p) => !isNaN(parseInt(p.id, 10)))
  let cells: PassthroughCell[]
  if (allNumeric) {
    const max = Math.max(...sorted.map((p) => parseInt(p.id, 10)))
    cells = Array.from({ length: max }, (_, i) => {
      const id   = String(i + 1)
      const port = sorted.find((p) => p.id === id) ?? null
      if (!port) return { portId: null, back: null, front: null, poe: false }
      const [back, front] = passthroughConnections(topology, entity.id, port.id)
      return { portId: port.id, back, front, poe: isPassthroughPortPoe(topology, entity.id, port.id) }
    })
  } else {
    cells = sorted.map((port) => {
      const [back, front] = passthroughConnections(topology, entity.id, port.id)
      return { portId: port.id, back, front, poe: isPassthroughPortPoe(topology, entity.id, port.id) }
    })
  }
  const rows: PassthroughCell[][] = []
  for (let i = 0; i < cells.length; i += COLS) rows.push(cells.slice(i, i + COLS))
  return rows
}

function buildTerminalGrid(entity: AnyEntity, topology: Topology): TerminalCell[][] {
  const ports = getPorts(entity) as Port[]
  if (ports.length === 0) return []
  const cells = ports.map((port) => ({
    portId:    port.id,
    label:     port.label,
    poe:       port.poe ?? false,
    connected: connectedEntityName(topology, entity.id, port.id, undefined),
  }))
  const rows: TerminalCell[][] = []
  for (let i = 0; i < cells.length; i += COLS) rows.push(cells.slice(i, i + COLS))
  return rows
}

// ---------------------------------------------------------------------------
// Drag state type shared by both grids
// ---------------------------------------------------------------------------

interface DragState {
  dragging: string | null        // portId being dragged
  over: string | null            // slot id being hovered (may be a defined port or an empty slot)
  onDragStart: (portId: string) => void
  onDragOver:  (slotId: string) => void
  onDragEnd:   () => void
  onDrop:      (slotId: string, slotExists: boolean) => void
}

// ---------------------------------------------------------------------------
// Grid sub-components
// ---------------------------------------------------------------------------

function PassthroughGrid({
  entity, topology, drag,
}: { entity: AnyEntity; topology: Topology; drag: DragState }) {
  const rows = buildPassthroughGrid(entity, topology)
  if (rows.length === 0) return <p className="text-gray-500 text-sm italic">No ports defined.</p>

  return (
    <div className="space-y-1">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-1">
          {row.map((cell, colIdx) => {
            const portNum    = rowIdx * COLS + colIdx + 1
            const slotId     = cell.portId ?? String(portNum)
            const slotExists = cell.portId !== null
            const isDropTarget = !!drag.dragging && drag.dragging !== slotId
            const isDragging = slotExists && drag.dragging === slotId
            const isOver     = drag.over === slotId && drag.dragging !== slotId
            return (
              <div
                key={colIdx}
                draggable={slotExists}
                onDragStart={slotExists ? () => drag.onDragStart(slotId) : undefined}
                onDragOver={isDropTarget ? (e) => { e.preventDefault(); drag.onDragOver(slotId) } : undefined}
                onDragEnd={drag.onDragEnd}
                onDrop={isDropTarget ? (e) => { e.preventDefault(); drag.onDrop(slotId, slotExists) } : undefined}
                className={[
                  'flex-1 min-w-0 rounded border overflow-hidden text-[11px] transition-all',
                  cell.poe ? 'border-amber-500/60' : 'border-gray-600',
                  slotExists ? 'cursor-grab' : (isDropTarget ? 'cursor-copy' : ''),
                  isDragging ? 'opacity-40' : '',
                  isOver ? 'ring-2 ring-blue-400' : '',
                ].join(' ')}
                style={{ minWidth: 0 }}
              >
                <div className={`text-center font-mono px-1 py-0.5 border-b truncate ${cell.poe ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                  {cell.portId ?? portNum}
                </div>
                <div className="px-1 py-0.5 border-b border-gray-700/60 truncate" title={cell.front ?? undefined}>
                  <span className={`font-bold mr-1 ${cell.poe ? 'text-amber-400' : 'text-gray-500'}`}>F</span>
                  <span className={cell.front ? 'text-gray-200' : 'text-gray-600'}>{cell.front ?? '—'}</span>
                </div>
                <div className="px-1 py-0.5 truncate" title={cell.back ?? undefined}>
                  <span className={`font-bold mr-1 ${cell.poe ? 'text-amber-400' : 'text-gray-500'}`}>B</span>
                  <span className={cell.back ? 'text-gray-200' : 'text-gray-600'}>{cell.back ?? '—'}</span>
                </div>
              </div>
            )
          })}
          {Array.from({ length: COLS - row.length }).map((_, i) => (
            <div key={`pad-${i}`} className="flex-1" style={{ minWidth: 0 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function TerminalGrid({
  entity, topology, drag,
}: { entity: AnyEntity; topology: Topology; drag: DragState }) {
  const rows = buildTerminalGrid(entity, topology)
  if (rows.length === 0) return <p className="text-gray-500 text-sm italic">No ports defined.</p>

  return (
    <div className="space-y-1">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-1">
          {row.map((cell, colIdx) => {
            const isDragging = drag.dragging === cell.portId
            const isOver     = drag.over === cell.portId && drag.dragging !== cell.portId
            return (
              <div
                key={colIdx}
                draggable
                onDragStart={() => drag.onDragStart(cell.portId)}
                onDragOver={(e) => { e.preventDefault(); drag.onDragOver(cell.portId) }}
                onDragEnd={drag.onDragEnd}
                onDrop={(e) => { e.preventDefault(); drag.onDrop(cell.portId, true) }}
                className={[
                  'flex-1 min-w-0 rounded border overflow-hidden text-[11px] cursor-grab transition-all',
                  cell.poe ? 'border-amber-500/60' : 'border-gray-600',
                  isDragging ? 'opacity-40' : '',
                  isOver ? 'ring-2 ring-blue-400' : '',
                ].join(' ')}
              >
                <div
                  className={`text-center font-mono px-1 py-0.5 border-b truncate ${cell.poe ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-gray-700 text-gray-300 border-gray-600'}`}
                  title={cell.portId}
                >
                  {cell.portId}{cell.label ? ` · ${cell.label}` : ''}
                </div>
                <div className="px-1 py-1 truncate text-center" title={cell.connected ?? undefined}>
                  <span className={cell.connected ? 'text-gray-200' : 'text-gray-600'}>
                    {cell.connected ?? '—'}
                  </span>
                </div>
              </div>
            )
          })}
          {Array.from({ length: COLS - row.length }).map((_, i) => (
            <div key={`pad-${i}`} className="flex-1" style={{ minWidth: 0 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export default function PortsModal({ entityId, topology, onSaved, onClose }: PortsModalProps) {
  const entity        = getEntity(topology, entityId)
  const isPassthrough = entity ? isPassthroughEntity(topology, entityId) : false

  // Local working copy — swaps accumulate here until explicitly saved
  const [localTopology, setLocalTopology] = useState<Topology>(topology)
  const isDirty = localTopology !== topology

  const [dragging, setDragging] = useState<string | null>(null)
  const [over,     setOver]     = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  if (!entity) return null

  const drag: DragState = {
    dragging,
    over,
    onDragStart: (portId) => { setDragging(portId); setOver(null) },
    onDragOver:  (portId) => setOver(portId),
    onDragEnd:   () => { setDragging(null); setOver(null) },
    onDrop: (slotId, slotExists) => {
      setDragging(null)
      setOver(null)
      if (!dragging || dragging === slotId) return
      setLocalTopology((prev) =>
        slotExists
          ? swapPorts(prev, entityId, dragging, slotId)
          : movePort(prev, entityId, dragging, slotId)
      )
    },
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveTopology(localTopology)
      onSaved(saved)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 flex flex-col max-h-[90vh] w-full max-w-5xl mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <PlugZap size={16} className="text-blue-400" />
            <h2 className="text-white font-semibold text-base">{entity.name}</h2>
            <span className="text-gray-400 text-sm">— port map</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-lg px-3 py-2 border border-red-700 mb-3">{error}</p>
          )}
          {isPassthrough
            ? <PassthroughGrid entity={getEntity(localTopology, entityId)!} topology={localTopology} drag={drag} />
            : <TerminalGrid    entity={getEntity(localTopology, entityId)!} topology={localTopology} drag={drag} />
          }
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700 shrink-0">
          <button
            onClick={() => { setLocalTopology(topology); setError(null) }}
            disabled={!isDirty}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
