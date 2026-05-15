import React, { useState } from 'react'
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

export function getPorts(entity: AnyEntity): (Port | PassthroughPort)[] {
  const ports: (Port | PassthroughPort)[] = []
  if ('isp_port' in entity)    ports.push(entity.isp_port)
  if ('uplink_port' in entity) ports.push(entity.uplink_port)
  if ('ports' in entity)       ports.push(...entity.ports)
  return ports
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
  side: EndpointSide | ''
}

function initEndpoint(entityId: string, portId: string, side: EndpointSide | undefined, topology: Topology): EndpointState {
  const entity = getEntity(topology, entityId)
  const ports  = entity ? getPorts(entity) : []
  const exists = ports.some((p) => p.id === portId)
  return {
    entityId,
    portId,
    isNew:       !exists && ports.length === 0,
    newType:     'rj45',
    newStandard: '1gbps',
    side:        side ?? '',
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
  lockedEntityId?: string   // prevents changing entity
  lockedPortId?: string     // prevents changing port
  state: EndpointState
  onChange: (s: EndpointState) => void
}

function EndpointPicker({ label, topology, lockedEntityId, lockedPortId, state, onChange }: EndpointPickerProps) {
  const NEW_SENTINEL = '__new__'
  const entity = getEntity(topology, state.entityId)
  const ports  = entity ? getPorts(entity) : []
  const entities = getAllEntities(topology)
  const isPassthrough = isPassthroughEntity(topology, state.entityId)

  function handleEntityChange(id: string) {
    const newEntity = getEntity(topology, id)
    const newPorts  = newEntity ? getPorts(newEntity) : []
    onChange({ ...state, entityId: id, portId: newPorts[0]?.id ?? '', isNew: newPorts.length === 0, side: '' })
  }

  function handlePortSelect(value: string) {
    if (value === NEW_SENTINEL) {
      onChange({ ...state, portId: '', isNew: true })
    } else {
      onChange({ ...state, portId: value, isNew: false })
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
            {ports.map((p) => (
              <option key={p.id} value={p.id}>{p.id}{p.label ? ` — ${p.label}` : ''}</option>
            ))}
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
          <div className="grid grid-cols-3 gap-2">
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
            <option value="front">Front</option>
            <option value="back">Back</option>
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

  const [from, setFrom] = useState<EndpointState>(() => {
    if (existingConnection) {
      return initEndpoint(existingConnection.from.entity_id, existingConnection.from.port_id, existingConnection.from.side, topology)
    }
    const entity = getEntity(topology, sourceId)
    const ports  = entity ? getPorts(entity) : []
    return {
      entityId:    sourceId,
      portId:      lockedPortId ?? ports[0]?.id ?? '',
      isNew:       !lockedPortId && ports.length === 0,
      newType:     'rj45',
      newStandard: '1gbps',
      side:        '',
    }
  })

  const entities    = getAllEntities(topology)
  const otherEntity = entities.find((e) => e.id !== sourceId)

  const [to, setTo] = useState<EndpointState>(() => {
    if (existingConnection) {
      return initEndpoint(existingConnection.to.entity_id, existingConnection.to.port_id, existingConnection.to.side, topology)
    }
    const def = (targetId ? getEntity(topology, targetId) : null) ?? otherEntity ?? entities[0]
    const ports = def ? getPorts(def) : []
    return {
      entityId:    def?.id ?? '',
      portId:      ports[0]?.id ?? '',
      isNew:       ports.length === 0,
      newType:     'rj45',
      newStandard: '1gbps',
      side:        '',
    }
  })

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSave() {
    if (!from.portId || !to.portId) { setError('Both ports are required.'); return }
    setSaving(true)
    setError(null)
    try {
      let updated = topology

      if (from.isNew) {
        updated = addPortToEntity(updated, from.entityId, { id: from.portId, connection_type: from.newType, standard: from.newStandard })
      }
      if (to.isNew) {
        updated = addPortToEntity(updated, to.entityId, { id: to.portId, connection_type: to.newType, standard: to.newStandard })
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
            lockedEntityId={sourceId}
            lockedPortId={lockedPortId}
            state={from}
            onChange={setFrom}
          />

          <div className="border-t border-gray-700" />

          <EndpointPicker
            label="To"
            topology={topology}
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
