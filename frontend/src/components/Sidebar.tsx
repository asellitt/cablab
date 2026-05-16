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
} from 'lucide-react'
import type { Topology, EntityType, AnyEntity } from '../types/topology'

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
  onAddEntity: (type: EntityType) => void
  onShowYaml: () => void
  onShowCables: () => void
}

export default function Sidebar({
  topology,
  selectedEntityId,
  onSelectEntity,
  onAddEntity,
  onShowYaml,
  onShowCables,
}: SidebarProps) {
  return (
    <aside className="w-[300px] flex-shrink-0 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-white text-xl font-bold tracking-tight">Cablr</h1>
        <p className="text-gray-400 text-xs mt-0.5">Homelab cable visualiser</p>
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
              onAdd={() => onAddEntity(type)}
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
  onAdd: () => void
}

function Section({
  type,
  label,
  entities,
  Icon,
  colorClass,
  selectedEntityId,
  onSelectEntity,
  onAdd,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name))

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
            <button
              key={entity.id}
              onClick={() => onSelectEntity(entity.id)}
              className={`w-full text-left px-4 py-1.5 rounded-md text-sm transition-colors ${
                selectedEntityId === entity.id
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
              }`}
            >
              <span className="truncate block">{entity.name}</span>
              <span className="text-gray-500 text-xs truncate block">{entity.id}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
