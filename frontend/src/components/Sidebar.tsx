import React, { useState } from 'react'
import {
  Monitor,
  GitBranch,
  Wifi,
  LayoutGrid,
  SquareDashedBottom,
  Plus,
  FileCode,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { Topology, EntityType, AnyEntity } from '../types/topology'
import { saveTopology } from '../api/client'

interface SectionConfig {
  type: EntityType
  label: string
  pluralKey: keyof Topology
  Icon: React.ComponentType<{ size?: number; className?: string }>
  colorClass: string
}

const SECTIONS: SectionConfig[] = [
  { type: 'router',      label: 'Routers',      pluralKey: 'routers',      Icon: Wifi,               colorClass: 'text-purple-400' },
  { type: 'switch',      label: 'Switches',     pluralKey: 'switches',     Icon: GitBranch,          colorClass: 'text-green-400'  },
  { type: 'patch_panel', label: 'Patch Panels', pluralKey: 'patch_panels', Icon: LayoutGrid,         colorClass: 'text-orange-400' },
  { type: 'wall_panel',  label: 'Wall Panels',  pluralKey: 'wall_panels',  Icon: SquareDashedBottom, colorClass: 'text-yellow-400' },
  { type: 'device',      label: 'Devices',      pluralKey: 'devices',      Icon: Monitor,            colorClass: 'text-blue-400'   },
]

interface SidebarProps {
  topology: Topology
  selectedEntityId: string | null
  onSelectEntity: (id: string) => void
  onEditEntity: (id: string) => void
  onAddEntity: (type: EntityType) => void
  onTopologyChange: (t: Topology) => void
  onShowYaml: () => void
  onShowCables: () => void
}

export default function Sidebar({
  topology,
  selectedEntityId,
  onSelectEntity,
  onEditEntity,
  onAddEntity,
  onTopologyChange,
  onShowYaml,
  onShowCables,
}: SidebarProps) {
  return (
    <aside className="w-[300px] flex-shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0 flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 3 24 20" width="32" height="26" className="flex-shrink-0">
          <line x1="16" y1="14" x2="16" y2="7"  stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
          <line x1="16" y1="14" x2="23" y2="19" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
          <line x1="16" y1="14" x2="9"  y2="19" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="16" cy="14" r="4" fill="#38bdf8"/>
          <circle cx="16" cy="6"  r="3" fill="#7dd3fc"/>
          <circle cx="24" cy="20" r="3" fill="#7dd3fc"/>
          <circle cx="8"  cy="20" r="3" fill="#7dd3fc"/>
          <circle cx="16" cy="14" r="1.5" fill="#1e293b"/>
          <circle cx="16" cy="6"  r="1.2" fill="#1e293b"/>
          <circle cx="24" cy="20" r="1.2" fill="#1e293b"/>
          <circle cx="8"  cy="20" r="1.2" fill="#1e293b"/>
        </svg>
        <div>
          <h1 className="text-white text-xl font-bold tracking-tight">Cablab</h1>
          <p className="text-gray-400 text-xs mt-0.5">Homelab cable visualiser</p>
        </div>
      </div>

      {/* Entity sections — scrollable */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 min-h-0">
        {SECTIONS.map(({ type, label, pluralKey, Icon, colorClass }) => {
          const entities = topology[pluralKey] as AnyEntity[]
          return (
            <Section
              key={type}
              type={type}
              label={label}
              entities={entities}
              Icon={Icon}
              colorClass={colorClass}
              selectedEntityId={selectedEntityId}
              onSelectEntity={onSelectEntity}
              onEditEntity={onEditEntity}
              onAdd={() => onAddEntity(type)}
              topology={topology}
              onTopologyChange={onTopologyChange}
            />
          )
        })}
      </nav>

      {/* Footer — always visible */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-700 flex items-center justify-between">
        <button
          onClick={onShowCables}
          className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
        >
          {topology.connections.length} cable
          {topology.connections.length !== 1 ? 's' : ''}
        </button>
        <button
          onClick={onShowYaml}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          title="View YAML"
        >
          <FileCode size={13} />
          YAML
        </button>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

interface SectionProps {
  type: EntityType
  label: string
  entities: AnyEntity[]
  Icon: React.ComponentType<{ size?: number; className?: string }>
  colorClass: string
  selectedEntityId: string | null
  onSelectEntity: (id: string) => void
  onEditEntity: (id: string) => void
  onAdd: () => void
  topology: Topology
  onTopologyChange: (t: Topology) => void
}

function Section({
  type,
  label,
  entities,
  Icon,
  colorClass,
  selectedEntityId,
  onSelectEntity,
  onEditEntity,
  onAdd,
  topology,
  onTopologyChange,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name))

  async function handleDelete(id: string) {
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
    setConfirmDeleteId(null)
    onTopologyChange(saved)
  }

  return (
    <div className="mb-2">
      {/* Section header */}
      <div className="flex items-center justify-between px-2 py-1.5 rounded-md group">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
          title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        >
          {collapsed
            ? <ChevronRight size={13} className="text-gray-500 flex-shrink-0" />
            : <ChevronDown  size={13} className="text-gray-500 flex-shrink-0" />
          }
          <Icon size={14} className={`${colorClass} flex-shrink-0`} />
          <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
            {label}
          </span>
          <span className="text-gray-600 text-xs ml-1">({entities.length})</span>
        </button>
        <button
          onClick={onAdd}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white flex-shrink-0"
          title={`Add ${type.replace('_', ' ')}`}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Entity rows */}
      {!collapsed && (
        <>
          {sorted.length === 0 && (
            <p className="text-gray-600 text-xs px-4 py-1">None</p>
          )}
          {sorted.map((entity) => (
            <div key={entity.id}>
              {confirmDeleteId === entity.id ? (
                /* Confirm delete inline */
                <div className="mx-1 mb-1 px-3 py-2 rounded-md bg-red-900/30 border border-red-700/50">
                  <p className="text-red-300 text-xs mb-2">Delete and remove all cables?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(entity.id)}
                      className="flex-1 px-2 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex items-center rounded-md group/row transition-colors ${
                    selectedEntityId === entity.id ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                  }`}
                >
                  <button
                    onClick={() => onSelectEntity(entity.id)}
                    className={`flex-1 min-w-0 text-left px-4 py-1.5 text-sm ${
                      selectedEntityId === entity.id ? 'text-white' : 'text-gray-300 group-hover/row:text-white'
                    }`}
                  >
                    <span className="truncate block">{entity.name}</span>
                    <span className="text-gray-500 text-xs truncate block">{entity.id}</span>
                  </button>
                  <div className="opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center gap-0.5 mr-1 flex-shrink-0">
                    <button
                      onClick={() => onEditEntity(entity.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-600"
                      title={`Edit ${entity.name}`}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(entity.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-600"
                      title={`Delete ${entity.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
