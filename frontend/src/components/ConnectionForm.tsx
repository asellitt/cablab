import React, { useState, useEffect } from 'react'
import { X, Cable } from 'lucide-react'
import type {
  Topology,
  AnyEntity,
  Connection,
  Port,
  PassthroughPort,
  ConnectionType,
  PortStandard,
  EndpointSide,
} from '../types/topology'
import { CONNECTION_TYPES, PORT_STANDARDS } from '../types/topology'
import { saveTopology } from '../api/client'

interface ConnectionFormProps {
  // For a new connection: source entity is fixed, user picks the target.
  // For editing: source/target come from the existing connection.
  sourceId: string
  // When provided, pre-selects the To entity (e.g. from a drag-connect)
  targetId?: string
  topology: Topology
  onSaved: (topology: Topology) => void
  onClose: () => void
  // When provided, we are editing this existing connection
  existingConnection?: Connection
  // When provided, lock the local port (used when opening from a port row)
  lockedPortId?: string
}

function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`
}

export function isVlanEntity(topology: Topology, entityId: string): boolean {
  const sw = topology.switches.find((e) => e.id === entityId)
  if (sw) return sw.managed
  return topology.routers.some((e) => e.id === entityId)
}

export function isPassthroughEntity(topology: Topology, entityId: string): boolean {
  return (
    topology.patch_panels.some((e) => e.id === entityId) ||
    topology.wall_panels.some((e) => e.id === entityId)
  )
}

export function getAllEntities(topology: Topology): AnyEntity[] {
  return [
    ...topology.devices,
    ...topology.switches,
    ...topology.routers,
    ...topology.patch_panels,
    ...topology.wall_panels,
  ]
}

export function getEntity(topology: Topology, id: string): AnyEntity | null {
  return getAllEntities(topology).find((e) => e.id === id) ?? null
}

function portIdComparator(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  if (!isNaN(na)) return -1
  if (!isNaN(nb)) return 1
  return a.localeCompare(b)
}

export function getPorts(entity: AnyEntity): (Port | PassthroughPort)[] {
  const fixed: (Port | PassthroughPort)[] = []
  if ('isp_port' in entity)    fixed.push(entity.isp_port)
  if ('uplink_port' in entity) fixed.push(entity.uplink_port)
  const numbered = ('ports' in entity ? [...entity.ports] : [])
    .sort((a, b) => portIdComparator(a.id, b.id))
  return [...fixed, ...numbered]
}

// Returns a Set of occupied slot keys.
// Terminal ports: "entityId:portId"
// Passthrough ports: "entityId:portId:front" and/or "entityId:portId:back"
export function occupiedSlots(topology: Topology, excludeConnectionId?: string): Set<string> {
  const slots = new Set<string>()
  for (const conn of topology.connections) {
    if (conn.id === excludeConnectionId) continue
    for (const ep of [conn.from, conn.to]) {
      if (ep.side) {
        slots.add(`${ep.entity_id}:${ep.port_id}:${ep.side}`)
      } else {
        slots.add(`${ep.entity_id}:${ep.port_id}`)
      }
    }
  }
  return slots
}

function isPortOccupied(
  occupied: Set<string>,
  entityId: string,
  portId: string,
  isPassthrough: boolean,
): boolean {
  if (!isPassthrough) return occupied.has(`${entityId}:${portId}`)
  // Passthrough: occupied only when both sides are taken
  return occupied.has(`${entityId}:${portId}:front`) && occupied.has(`${entityId}:${portId}:back`)
}

function toPassthroughPort(port: Port): PassthroughPort {
  return { id: port.id, connection_type: port.connection_type, standard: port.standard }
}

function addPortToEntity(topology: Topology, entityId: string, port: Port): Topology {
  return {
    ...topology,
    devices:      topology.devices.map((e)      => e.id === entityId ? { ...e, ports: [...e.ports, port] } : e),
    switches:     topology.switches.map((e)     => e.id === entityId ? { ...e, ports: [...e.ports, port] } : e),
    routers:      topology.routers.map((e)      => e.id === entityId ? { ...e, ports: [...e.ports, port] } : e),
    patch_panels: topology.patch_panels.map((e) => e.id === entityId ? { ...e, ports: [...e.ports, toPassthroughPort(port)] } : e),
    wall_panels:  topology.wall_panels.map((e)  => e.id === entityId ? { ...e, ports: [...e.ports, toPassthroughPort(port)] } : e),
  }
}

// ---------------------------------------------------------------------------
// Per-endpoint state
// ---------------------------------------------------------------------------

interface EndpointState {
  entityId: string
  portId: string
  isNew: boolean
  newType: ConnectionType
  newStandard: PortStandard
  newPoe: boolean
  newVlan: string
  side: EndpointSide | ''
}

function firstAvailableSideFor(entityId: string, portId: string, occupied: Set<string>): EndpointSide | '' {
  if (!occupied.has(`${entityId}:${portId}:front`)) return 'front'
  if (!occupied.has(`${entityId}:${portId}:back`))  return 'back'
  return ''
}

function initEndpoint(entityId: string, portId: string, side: EndpointSide | undefined, topology: Topology, occupied: Set<string>): EndpointState {
  const entity      = getEntity(topology, entityId)
  const ports       = entity ? getPorts(entity) : []
  const exists      = ports.some((p) => p.id === portId)
  const isPass      = isPassthroughEntity(topology, entityId)
  const resolvedSide = side ?? (isPass && portId ? firstAvailableSideFor(entityId, portId, occupied) : '')
  return {
    entityId,
    portId,
    isNew:       !exists && ports.length === 0,
    newType:     'rj45',
    newStandard: '1gbps',
    newPoe:      false,
    newVlan:     '',
    side:        resolvedSide,
  }
}

// ---------------------------------------------------------------------------
// EndpointPicker
// ---------------------------------------------------------------------------

const selectCls = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 text-sm'
const inputCls  = 'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 text-sm'

interface EndpointPickerProps {
  label: string
  topology: Topology
  occupied: Set<string>
  lockedEntityId?: string   // prevents changing entity
  lockedPortId?: string     // prevents changing port
  state: EndpointState
  onChange: (s: EndpointState) => void
}

function EndpointPicker({ label, topology, occupied, lockedEntityId, lockedPortId, state, onChange }: EndpointPickerProps) {
  const NEW_SENTINEL = '__new__'
  const entity = getEntity(topology, state.entityId)
  const ports  = entity ? getPorts(entity) : []
  const entities = getAllEntities(topology)
  const isPassthrough = isPassthroughEntity(topology, state.entityId)

  function firstAvailablePort(entityId: string, pts: (Port | PassthroughPort)[], isPass: boolean): string {
    const free = pts.find((p) => !isPortOccupied(occupied, entityId, p.id, isPass))
    return free?.id ?? pts[0]?.id ?? ''
  }

  function handleEntityChange(id: string) {
    const newEntity  = getEntity(topology, id)
    const newPorts   = newEntity ? getPorts(newEntity) : []
    const newIsPass  = isPassthroughEntity(topology, id)
    const newPortId  = firstAvailablePort(id, newPorts, newIsPass)
    const newSide    = newIsPass && newPortId ? firstAvailableSideFor(id, newPortId, occupied) : ''
    onChange({ ...state, entityId: id, portId: newPortId, isNew: newPorts.length === 0, side: newSide })
  }

  function handlePortSelect(value: string) {
    if (value === NEW_SENTINEL) {
      onChange({ ...state, portId: '', isNew: true, side: '' })
    } else {
      const newSide = isPassthrough ? firstAvailableSideFor(state.entityId, value, occupied) : ''
      onChange({ ...state, portId: value, isNew: false, side: newSide })
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-gray-300 text-sm font-medium">{label}</p>

      {/* Entity selector */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">Entity</label>
        {lockedEntityId ? (
          <div className={`${inputCls} opacity-60 cursor-not-allowed`}>{entity?.name ?? lockedEntityId}</div>
        ) : (
          <select value={state.entityId} onChange={(e) => handleEntityChange(e.target.value)} className={selectCls}>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      {/* Port selector */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">Port</label>
        {lockedPortId ? (
          <div className={`${inputCls} opacity-60 cursor-not-allowed`}>{lockedPortId}</div>
        ) : ports.length > 0 ? (
          <select value={state.isNew ? NEW_SENTINEL : state.portId} onChange={(e) => handlePortSelect(e.target.value)} className={selectCls}>
            {ports.map((p) => {
              const occ = isPortOccupied(occupied, state.entityId, p.id, isPassthrough)
              return (
                <option key={p.id} value={p.id} disabled={occ} style={occ ? { color: '#6b7280' } : undefined}>
                  {p.id}{p.label ? ` — ${p.label}` : ''}{occ ? ' (in use)' : ''}
                </option>
              )
            })}
            <option value={NEW_SENTINEL}>+ New port…</option>
          </select>
        ) : (
          <div className="text-gray-500 text-xs italic px-1 mb-1">No ports — define one below</div>
        )}
      </div>

      {/* New port fields */}
      {!lockedPortId && state.isNew && (
        <div className="border border-gray-600 rounded-lg p-3 space-y-2">
          <p className="text-gray-400 text-xs font-medium">New port</p>
          <div className={`grid gap-2 items-end ${isVlanEntity(topology, state.entityId) ? 'grid-cols-[1fr_1fr_1fr_1fr_auto]' : 'grid-cols-[1fr_1fr_1fr_auto]'}`}>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">ID</label>
              <input value={state.portId} onChange={(e) => onChange({ ...state, portId: e.target.value })} className={inputCls} placeholder="e.g. eth0" />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Type</label>
              <select value={state.newType} onChange={(e) => onChange({ ...state, newType: e.target.value as ConnectionType })} className={selectCls}>
                {CONNECTION_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Standard</label>
              <select value={state.newStandard} onChange={(e) => onChange({ ...state, newStandard: e.target.value as PortStandard })} className={selectCls}>
                {PORT_STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {isVlanEntity(topology, state.entityId) && (
              <div>
                <label className="text-gray-400 text-xs mb-1 block">VLAN</label>
                <input value={state.newVlan} onChange={(e) => onChange({ ...state, newVlan: e.target.value })} className={inputCls} placeholder="default" />
              </div>
            )}
            <div className="flex flex-col items-center gap-0.5 pb-1">
              <label className="text-gray-400 text-xs">PoE</label>
              <input type="checkbox" checked={state.newPoe} onChange={(e) => onChange({ ...state, newPoe: e.target.checked })} className="w-4 h-4 rounded accent-blue-500" />
            </div>
          </div>
        </div>
      )}

      {/* Side — front/back, only relevant for passthrough entities */}
      {isPassthrough && (
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Side</label>
          <select
            value={state.side}
            onChange={(e) => onChange({ ...state, side: e.target.value as EndpointSide | '' })}
            className={selectCls}
          >
            <option value="">— select —</option>
            {(['front', 'back'] as EndpointSide[]).map((s) => {
              const occ = occupied.has(`${state.entityId}:${state.portId}:${s}`)
              return (
                <option key={s} value={s} disabled={occ} style={occ ? { color: '#6b7280' } : undefined}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}{occ ? ' (in use)' : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export default function ConnectionForm({
  sourceId,
  targetId,
  topology,
  onSaved,
  onClose,
  existingConnection,
  lockedPortId,
}: ConnectionFormProps) {
  const isEditing = Boolean(existingConnection)
  const occupied  = occupiedSlots(topology, existingConnection?.id)

  const [from, setFrom] = useState<EndpointState>(() => {
    if (existingConnection) {
      return initEndpoint(existingConnection.from.entity_id, existingConnection.from.port_id, existingConnection.from.side, topology, occupied)
    }
    const entity    = getEntity(topology, sourceId)
    const ports     = entity ? getPorts(entity) : []
    const isPass    = isPassthroughEntity(topology, sourceId)
    const portId    = lockedPortId ?? ports.find((p) => !isPortOccupied(occupied, sourceId, p.id, isPass))?.id ?? ports[0]?.id ?? ''
    const side      = isPass && portId ? firstAvailableSideFor(sourceId, portId, occupied) : ''
    return {
      entityId:    sourceId,
      portId,
      isNew:       !lockedPortId && ports.length === 0,
      newType:     'rj45',
      newStandard: '1gbps',
      newPoe:      false,
      newVlan:     '',
      side,
    }
  })

  const entities    = getAllEntities(topology)
  const otherEntity = entities.find((e) => e.id !== sourceId)

  const [to, setTo] = useState<EndpointState>(() => {
    if (existingConnection) {
      return initEndpoint(existingConnection.to.entity_id, existingConnection.to.port_id, existingConnection.to.side, topology, occupied)
    }
    const def    = (targetId ? getEntity(topology, targetId) : null) ?? otherEntity ?? entities[0]
    const ports  = def ? getPorts(def) : []
    const isPass = def ? isPassthroughEntity(topology, def.id) : false
    const portId = ports.find((p) => !isPortOccupied(occupied, def?.id ?? '', p.id, isPass))?.id ?? ports[0]?.id ?? ''
    const side   = isPass && portId && def ? firstAvailableSideFor(def.id, portId, occupied) : ''
    return {
      entityId:    def?.id ?? '',
      portId,
      isNew:       ports.length === 0,
      newType:     'rj45',
      newStandard: '1gbps',
      newPoe:      false,
      newVlan:     '',
      side,
    }
  })

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      handleSave()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  async function handleSave() {
    if (!from.portId || !to.portId) { setError('Both ports are required.'); return }
    setSaving(true)
    setError(null)
    try {
      let updated = topology

      if (from.isNew) {
        const port: Port = { id: from.portId, connection_type: from.newType, standard: from.newStandard, poe: from.newPoe }
        if (from.newVlan.trim()) port.vlan = from.newVlan.trim()
        updated = addPortToEntity(updated, from.entityId, port)
      }
      if (to.isNew) {
        const port: Port = { id: to.portId, connection_type: to.newType, standard: to.newStandard, poe: to.newPoe }
        if (to.newVlan.trim()) port.vlan = to.newVlan.trim()
        updated = addPortToEntity(updated, to.entityId, port)
      }

      const conn: Connection = {
        id:   existingConnection?.id ?? generateId('conn'),
        from: { entity_id: from.entityId, port_id: from.portId, ...(from.side ? { side: from.side as EndpointSide } : {}) },
        to:   { entity_id: to.entityId,   port_id: to.portId,   ...(to.side   ? { side: to.side   as EndpointSide } : {}) },
      }

      if (isEditing) {
        updated = { ...updated, connections: updated.connections.map((c) => c.id === existingConnection!.id ? conn : c) }
      } else {
        updated = { ...updated, connections: [...updated.connections, conn] }
      }

      const saved = await saveTopology(updated)
      onSaved(saved)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Cable size={16} className="text-blue-400" />
            <h2 className="text-white font-semibold text-base">{isEditing ? 'Edit Connection' : 'New Connection'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <EndpointPicker
            label="From"
            topology={topology}
            occupied={occupied}
            lockedEntityId={sourceId}
            lockedPortId={lockedPortId}
            state={from}
            onChange={setFrom}
          />

          <div className="border-t border-gray-700" />

          <EndpointPicker
            label="To"
            topology={topology}
            occupied={occupied}
            state={to}
            onChange={setTo}
          />

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-lg px-3 py-2 border border-red-700">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors">
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Cable'}
          </button>
        </div>
      </div>
    </div>
  )
}
