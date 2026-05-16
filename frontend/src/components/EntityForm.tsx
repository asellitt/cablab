import React, { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { X, Plus, Trash2, ArrowRight, Pencil, Cable } from 'lucide-react'
import type {
  Topology,
  EntityType,
  AnyEntity,
  Connection,
  Device,
  Switch,
  Router,
  PatchPanel,
  WallPanel,
  Port,
  PassthroughPort,
} from '../types/topology'
import { CONNECTION_TYPES, PORT_STANDARDS } from '../types/topology'
import { saveTopology } from '../api/client'
import ConnectionForm, { getAllEntities } from './ConnectionForm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 7)}`
}

function nextPortId(existingIds: string[]): string {
  const nums = new Set(existingIds.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n)))
  let n = 1
  while (nums.has(n)) n++
  return String(n)
}

function portIdComparator(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (!isNaN(na) && !isNaN(nb)) return na - nb
  if (!isNaN(na)) return -1
  if (!isNaN(nb)) return 1
  return a.localeCompare(b)
}

function defaultPort(existingIds: string[] = []): Port {
  return { id: nextPortId(existingIds), connection_type: 'rj45', standard: '1gbps', poe: false }
}

function defaultPassthroughPort(existingIds: string[] = []): PassthroughPort {
  return { id: nextPortId(existingIds), connection_type: 'rj45', standard: '1gbps' }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EntityFormProps {
  entityType: EntityType
  existingEntity?: Device | Switch | Router | PatchPanel | WallPanel | null
  topology: Topology
  onSaved: (topology: Topology) => void
  onDeleted?: (topology: Topology) => void
  onClose: () => void
  startDeleting?: boolean
}

// ---------------------------------------------------------------------------
// Connection lookup helper
// ---------------------------------------------------------------------------

function allEntities(topology: Topology): AnyEntity[] {
  return [
    ...topology.devices,
    ...topology.switches,
    ...topology.routers,
    ...topology.patch_panels,
    ...topology.wall_panels,
  ]
}

interface PortConnection {
  connection: Connection
  remoteEntityName: string
  remotePortId: string
  remoteSide?: string
  localSide?: string
}

function connectionsForPort(topology: Topology, entityId: string, portId: string): PortConnection[] {
  const entities = allEntities(topology)
  const results: PortConnection[] = []

  for (const conn of topology.connections) {
    const fromMatch = conn.from.entity_id === entityId && conn.from.port_id === portId
    const toMatch   = conn.to.entity_id   === entityId && conn.to.port_id   === portId

    if (fromMatch) {
      const remote = entities.find((e) => e.id === conn.to.entity_id)
      if (remote) results.push({ connection: conn, remoteEntityName: remote.name, remotePortId: conn.to.port_id, remoteSide: conn.to.side, localSide: conn.from.side })
    } else if (toMatch) {
      const remote = entities.find((e) => e.id === conn.from.entity_id)
      if (remote) results.push({ connection: conn, remoteEntityName: remote.name, remotePortId: conn.from.port_id, remoteSide: conn.from.side, localSide: conn.to.side })
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Port list sub-component
// ---------------------------------------------------------------------------

interface PortListProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any
  fieldName: string
  label: string
  topology: Topology
  entityId: string | undefined
  onTopologyChange: (t: Topology) => void
  showVlan?: boolean
}

function PortList({ control, register, watch, fieldName, label, topology, entityId, onTopologyChange, showVlan = false }: PortListProps) {
  const { fields, append, remove, move } = useFieldArray({ control, name: fieldName })
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [addingConnectionForPort, setAddingConnectionForPort] = useState<string | null>(null)

  function appendPort() {
    const existingIds = fields.map((_, i) => watch(`${fieldName}.${i}.id`) as string)
    const newId = nextPortId(existingIds)
    append(defaultPort(existingIds))
    // Move the appended port into sorted position
    const insertAt = existingIds.findIndex((id) => portIdComparator(newId, id) < 0)
    if (insertAt !== -1) move(existingIds.length, insertAt)
  }

  async function deleteConnection(connId: string) {
    const updated = { ...topology, connections: topology.connections.filter((c) => c.id !== connId) }
    const saved = await saveTopology(updated)
    onTopologyChange(saved)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-gray-300 text-sm font-medium">{label}</label>
        <button
          type="button"
          onClick={appendPort}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Plus size={12} /> Add Port
        </button>
      </div>
      <div className="space-y-2">
        {fields.map((field, idx) => {
          const portId = watch(`${fieldName}.${idx}.id`) as string
          const connections = entityId ? connectionsForPort(topology, entityId, portId) : []
          const isExistingPort = Boolean(entityId)

          return (
          <div key={field.id} className="bg-gray-700 rounded-lg p-2 space-y-1.5">
            <div className={`grid gap-2 items-end ${showVlan ? 'grid-cols-[1fr_1fr_1fr_1fr_auto_auto]' : 'grid-cols-[1fr_1fr_1fr_auto_auto]'}`}>
              <div>
                <label className="text-gray-400 text-xs mb-0.5 block">ID</label>
                <input
                  {...register(`${fieldName}.${idx}.id`)}
                  className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="port-id"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-0.5 block">Type</label>
                <select
                  {...register(`${fieldName}.${idx}.connection_type`)}
                  className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
                >
                  {CONNECTION_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-0.5 block">Standard</label>
                <select
                  {...register(`${fieldName}.${idx}.standard`)}
                  className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
                >
                  {PORT_STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {showVlan && (
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">VLAN</label>
                  <input
                    {...register(`${fieldName}.${idx}.vlan`)}
                    className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="default"
                  />
                </div>
              )}
              <div className="flex flex-col items-center gap-0.5">
                <label className="text-gray-400 text-xs">PoE</label>
                <input type="checkbox" {...register(`${fieldName}.${idx}.poe`)} className="w-4 h-4 rounded accent-blue-500" />
              </div>
              <button type="button" onClick={() => remove(idx)} className="p-1 text-gray-400 hover:text-red-400 transition-colors self-end mb-0.5">
                <Trash2 size={13} />
              </button>
            </div>

            {/* Existing connections */}
            {connections.map((c) => (
              <div key={c.connection.id} className="flex items-center gap-1 text-xs text-gray-400 pl-1 group">
                <ArrowRight size={11} className="text-blue-400 flex-shrink-0" />
                <span className="text-blue-300">{c.remoteEntityName}</span>
                <span>·</span>
                <span className="text-gray-300">{c.remotePortId}</span>
                {(c.localSide || c.remoteSide) && (
                  <span className="text-gray-600">({[c.localSide, c.remoteSide].filter(Boolean).join(' → ')})</span>
                )}
                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditingConnection(c.connection)}
                    className="p-0.5 text-gray-500 hover:text-blue-400 transition-colors"
                    title="Edit connection"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConnection(c.connection.id)}
                    className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
                    title="Delete connection"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}

            {/* Add connection button */}
            {isExistingPort && (
              <button
                type="button"
                onClick={() => portId ? setAddingConnectionForPort(portId) : undefined}
                disabled={!portId}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors pl-1 disabled:opacity-40"
              >
                <Cable size={11} />
                Add connection
              </button>
            )}
          </div>
          )
        })}
        {fields.length === 0 && (
          <p className="text-gray-500 text-xs italic">No ports added yet.</p>
        )}
      </div>

      {/* Edit connection modal */}
      {editingConnection && entityId && (
        <ConnectionForm
          sourceId={entityId}
          topology={topology}
          existingConnection={editingConnection}
          onSaved={(t) => { onTopologyChange(t); setEditingConnection(null) }}
          onClose={() => setEditingConnection(null)}
        />
      )}

      {/* Add connection modal */}
      {addingConnectionForPort && entityId && (
        <ConnectionForm
          sourceId={entityId}
          topology={topology}
          lockedPortId={addingConnectionForPort}
          onSaved={(t) => { onTopologyChange(t); setAddingConnectionForPort(null) }}
          onClose={() => setAddingConnectionForPort(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Passthrough port list (patch panels, wall panels) — front + back sides
// ---------------------------------------------------------------------------

interface PassthroughPortListProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any
  label: string
  topology: Topology
  entityId: string | undefined
  onTopologyChange: (t: Topology) => void
}

const selectCls = 'w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500'

function PassthroughPortList({ control, register, watch, label, topology, entityId, onTopologyChange }: PassthroughPortListProps) {
  const { fields, append, remove, move } = useFieldArray({ control, name: 'ports' })
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null)
  const [addingConnectionForPort, setAddingConnectionForPort] = useState<string | null>(null)

  function appendPort() {
    const existingIds = fields.map((_, i) => watch(`ports.${i}.id`) as string)
    const newId = nextPortId(existingIds)
    append(defaultPassthroughPort(existingIds))
    const insertAt = existingIds.findIndex((id) => portIdComparator(newId, id) < 0)
    if (insertAt !== -1) move(existingIds.length, insertAt)
  }

  async function deleteConnection(connId: string) {
    const updated = { ...topology, connections: topology.connections.filter((c) => c.id !== connId) }
    const saved = await saveTopology(updated)
    onTopologyChange(saved)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-gray-300 text-sm font-medium">{label}</label>
        <button
          type="button"
          onClick={appendPort}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          <Plus size={12} /> Add Port
        </button>
      </div>
      <div className="space-y-2">
        {fields.map((field, idx) => {
          const portId = watch(`ports.${idx}.id`) as string
          const connections = entityId ? connectionsForPort(topology, entityId, portId) : []
          const isExistingPort = Boolean(entityId)

          return (
            <div key={field.id} className="bg-gray-700 rounded-lg p-2 space-y-1.5">
              {/* ID + label row */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">ID</label>
                  <input
                    {...register(`ports.${idx}.id`)}
                    className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. port-1"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">Label <span className="text-gray-600">(opt)</span></label>
                  <input
                    {...register(`ports.${idx}.label`)}
                    className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Office desk"
                  />
                </div>
                <button type="button" onClick={() => remove(idx)} className="p-1 text-gray-400 hover:text-red-400 transition-colors self-end mb-0.5">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Type + Standard */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">Type</label>
                  <select {...register(`ports.${idx}.connection_type`)} className={selectCls}>
                    {CONNECTION_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-0.5 block">Standard</label>
                  <select {...register(`ports.${idx}.standard`)} className={selectCls}>
                    {PORT_STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Connections */}
              {connections.map((c) => (
                <div key={c.connection.id} className="flex items-center gap-1 text-xs text-gray-400 pl-1 group">
                  <ArrowRight size={11} className="text-blue-400 flex-shrink-0" />
                  <span className="text-blue-300">{c.remoteEntityName}</span>
                  <span>·</span>
                  <span className="text-gray-300">{c.remotePortId}</span>
                  {(c.localSide || c.remoteSide) && (
                    <span className="text-gray-600">({[c.localSide, c.remoteSide].filter(Boolean).join(' → ')})</span>
                  )}
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => setEditingConnection(c.connection)} className="p-0.5 text-gray-500 hover:text-blue-400 transition-colors" title="Edit connection">
                      <Pencil size={11} />
                    </button>
                    <button type="button" onClick={() => deleteConnection(c.connection.id)} className="p-0.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete connection">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              ))}

              {isExistingPort && (
                <button
                  type="button"
                  onClick={() => portId ? setAddingConnectionForPort(portId) : undefined}
                  disabled={!portId}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors pl-1 disabled:opacity-40"
                >
                  <Cable size={11} />
                  Add connection
                </button>
              )}
            </div>
          )
        })}
        {fields.length === 0 && <p className="text-gray-500 text-xs italic">No ports added yet.</p>}
      </div>

      {editingConnection && entityId && (
        <ConnectionForm
          sourceId={entityId}
          topology={topology}
          existingConnection={editingConnection}
          onSaved={(t) => { onTopologyChange(t); setEditingConnection(null) }}
          onClose={() => setEditingConnection(null)}
        />
      )}
      {addingConnectionForPort && entityId && (
        <ConnectionForm
          sourceId={entityId}
          topology={topology}
          lockedPortId={addingConnectionForPort}
          onSaved={(t) => { onTopologyChange(t); setAddingConnectionForPort(null) }}
          onClose={() => setAddingConnectionForPort(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single port sub-form (for uplink_port, isp_port)
// ---------------------------------------------------------------------------

interface SinglePortProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  fieldName: string
  label: string
}

function SinglePort({ register, fieldName, label }: SinglePortProps) {
  return (
    <div>
      <label className="text-gray-300 text-sm font-medium block mb-1">{label}</label>
      <div className="bg-gray-700 rounded-lg p-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
        <div>
          <label className="text-gray-400 text-xs mb-0.5 block">ID</label>
          <input
            {...register(`${fieldName}.id`)}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="port-id"
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-0.5 block">Type</label>
          <select
            {...register(`${fieldName}.connection_type`)}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
          >
            {CONNECTION_TYPES.map((ct) => (
              <option key={ct} value={ct}>{ct}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-0.5 block">Standard</label>
          <select
            {...register(`${fieldName}.standard`)}
            className="w-full bg-gray-600 text-white text-xs rounded px-2 py-1 border border-gray-500 focus:outline-none focus:border-blue-500"
          >
            {PORT_STANDARDS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-center gap-0.5 pb-0.5">
          <label className="text-gray-400 text-xs">PoE</label>
          <input type="checkbox" {...register(`${fieldName}.poe`)} className="w-4 h-4 rounded accent-blue-500" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Switch-specific sub-form — owns the managed toggle + VLAN clear logic
// ---------------------------------------------------------------------------

interface SwitchFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: any
  topology: Topology
  entityId: string | undefined
  onTopologyChange: (t: Topology) => void
}

function SwitchFields({ register, control, watch, setValue, topology, entityId, onTopologyChange }: SwitchFieldsProps) {
  const managed = watch('managed')
  const ports: { vlan?: string }[] = watch('ports') ?? []

  // When managed is toggled off, reset all port VLANs to undefined
  useEffect(() => {
    if (!managed) {
      ports.forEach((_, i) => setValue(`ports.${i}.vlan`, undefined))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managed])

  return (
    <>
      <Field label="Managed">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...register('managed')}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <span className="text-gray-300 text-sm">Managed switch</span>
        </label>
      </Field>
      <SinglePort
        register={register}
        fieldName="uplink_port"
        label="Uplink Port"
      />
      <PortList
        control={control}
        register={register}
        watch={watch}
        fieldName="ports"
        label="Ports"
        topology={topology}
        entityId={entityId}
        onTopologyChange={onTopologyChange}
        showVlan={managed}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Field component helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-gray-300 text-sm font-medium block mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 text-sm'

// ---------------------------------------------------------------------------
// Main EntityForm
// ---------------------------------------------------------------------------

export default function EntityForm({
  entityType,
  existingEntity,
  topology: topologyProp,
  onSaved,
  onDeleted,
  onClose,
  startDeleting = false,
}: EntityFormProps) {
  const isEditing = Boolean(existingEntity)

  // Local topology copy so mid-form connection saves refresh the connection list
  const [topology, setTopology] = useState(topologyProp)

  // We use a generic record so react-hook-form can manage any entity shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, control, handleSubmit, reset, watch, setValue } = useForm<any>({
    defaultValues: buildDefaults(entityType, existingEntity),
  })

  // Reset form when the entity/type changes
  useEffect(() => {
    reset(buildDefaults(entityType, existingEntity))
  }, [entityType, existingEntity, reset])

  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(startDeleting)
  const [error, setError] = React.useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA') return
      e.preventDefault()
      if (confirmDelete) {
        handleDelete()
      } else {
        handleSubmit(onSubmit)()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDelete])

  function handleTopologyChange(t: Topology) {
    setTopology(t)
    onSaved(t)
  }

  async function handleDelete() {
    if (!existingEntity) return
    setDeleting(true)
    setError(null)
    try {
      const id = existingEntity.id
      const updated: Topology = {
        ...topology,
        devices:      topology.devices.filter((e)      => e.id !== id),
        switches:     topology.switches.filter((e)     => e.id !== id),
        routers:      topology.routers.filter((e)      => e.id !== id),
        patch_panels: topology.patch_panels.filter((e) => e.id !== id),
        wall_panels:  topology.wall_panels.filter((e)  => e.id !== id),
        connections:  topology.connections.filter(
          (c) => c.from.entity_id !== id && c.to.entity_id !== id
        ),
      }
      const saved = await saveTopology(updated)
      onDeleted?.(saved)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any) {
    setSaving(true)
    setError(null)
    try {
      const updated = applyEntityToTopology(topology, entityType, data, existingEntity?.id)
      const saved = await saveTopology(updated)
      onSaved(saved)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const title = `${isEditing ? 'Edit' : 'Add'} ${entityTypeLabel(entityType)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        >
          {/* Common: ID (readonly when editing) */}
          <Field label="ID">
            <input
              {...register('id', { required: true })}
              readOnly={isEditing}
              className={`${inputCls} ${isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="unique-id"
            />
          </Field>

          {/* Common: Name */}
          <Field label="Name">
            <input
              {...register('name', { required: true })}
              className={inputCls}
              placeholder="Display name"
            />
          </Field>

          {/* Common: Location */}
          <Field label="Location (optional)">
            <input
              {...register('location')}
              className={inputCls}
              placeholder="e.g. Office, Server Room"
            />
          </Field>

          {/* Type-specific fields */}
          {entityType === 'device' && (
            <PortList
              control={control}
              register={register}
              watch={watch}
              fieldName="ports"
              label="Ports"
              topology={topology}
              entityId={existingEntity?.id}
              onTopologyChange={handleTopologyChange}
            />
          )}

          {entityType === 'switch' && (
            <SwitchFields
              register={register}
              control={control}
              watch={watch}
              setValue={setValue}
              topology={topology}
              entityId={existingEntity?.id}
              onTopologyChange={handleTopologyChange}
            />
          )}

          {entityType === 'router' && (
            <>
              <SinglePort
                register={register}
                fieldName="isp_port"
                label="ISP / WAN Port"
              />
              <PortList
                control={control}
                register={register}
                watch={watch}
                fieldName="ports"
                label="LAN Ports"
                topology={topology}
                entityId={existingEntity?.id}
                onTopologyChange={handleTopologyChange}
                showVlan
              />
            </>
          )}

          {entityType === 'patch_panel' && (
            <PassthroughPortList
              control={control}
              register={register}
              watch={watch}
              label="Ports"
              topology={topology}
              entityId={existingEntity?.id}
              onTopologyChange={handleTopologyChange}
            />
          )}

          {entityType === 'wall_panel' && (
            <PassthroughPortList
              control={control}
              register={register}
              watch={watch}
              label="Ports"
              topology={topology}
              entityId={existingEntity?.id}
              onTopologyChange={handleTopologyChange}
            />
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-lg px-3 py-2 border border-red-700">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center px-5 py-4 border-t border-gray-700 gap-3">
          {/* Delete — only when editing */}
          {isEditing && (
            confirmDelete ? (
              <div className="flex items-center gap-2 mr-auto">
                <span className="text-red-400 text-xs">Delete and remove all cables?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-2 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="mr-auto px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            )
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Entity'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entityTypeLabel(type: EntityType): string {
  const m: Record<EntityType, string> = {
    device: 'Device',
    switch: 'Switch',
    router: 'Router',
    patch_panel: 'Patch Panel',
    wall_panel: 'Wall Panel',
  }
  return m[type]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortedPorts<T extends { id: string }>(ports: T[]): T[] {
  return [...ports].sort((a, b) => portIdComparator(a.id, b.id))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDefaults(type: EntityType, existing?: any): any {
  if (existing) {
    const sorted: any = { ...existing }
    if (Array.isArray(sorted.ports)) sorted.ports = sortedPorts(sorted.ports)
    return sorted
  }

  const base = { id: generateId(type.replace('_', '-')), name: '', location: '' }

  switch (type) {
    case 'device':
      return { ...base, ports: [] }
    case 'switch':
      return { ...base, managed: false, uplink_port: defaultPort(), ports: [] }
    case 'router':
      return { ...base, isp_port: defaultPort(), ports: [] }
    case 'patch_panel':
      return { ...base, ports: [] }
    case 'wall_panel':
      return { ...base, ports: [] }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyEntityToTopology(
  topology: Topology,
  type: EntityType,
  data: any,
  existingId: string | undefined
): Topology {
  const t = { ...topology }

  function upsert<T extends { id: string }>(list: T[], item: T): T[] {
    if (existingId) {
      return list.map((e) => (e.id === existingId ? item : e))
    }
    return [...list, item]
  }

  switch (type) {
    case 'device':
      t.devices = upsert(t.devices, data as Device)
      break
    case 'switch': {
      const sw = data as Switch
      // Unmanaged switches don't have per-port VLANs
      const cleanedSw = sw.managed ? sw : {
        ...sw,
        ports: sw.ports.map(({ vlan: _vlan, ...p }) => p),
      }
      t.switches = upsert(t.switches, cleanedSw)
      break
    }
    case 'router':
      t.routers = upsert(t.routers, data as Router)
      break
    case 'patch_panel':
      t.patch_panels = upsert(t.patch_panels, data as PatchPanel)
      break
    case 'wall_panel':
      t.wall_panels = upsert(t.wall_panels, data as WallPanel)
      break
  }

  return t
}
