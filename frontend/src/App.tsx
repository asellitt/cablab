import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchTopology } from './api/client'
import type { Topology, EntityType, AnyEntity } from './types/topology'
import { traceCableRun } from './utils/cableTrace'
import Sidebar from './components/Sidebar'
import TopologyGraph from './components/TopologyGraph'
import EntityForm from './components/EntityForm'
import YamlModal from './components/YamlModal'
import ConnectionForm from './components/ConnectionForm'
import CableList from './components/CableList'

// ---------------------------------------------------------------------------
// Helpers to find an entity by ID across all collections
// ---------------------------------------------------------------------------

function findEntityById(
  topology: Topology,
  id: string
): { entity: AnyEntity; type: EntityType } | null {
  const checks: { list: AnyEntity[]; type: EntityType }[] = [
    { list: topology.devices,      type: 'device'      },
    { list: topology.switches,     type: 'switch'      },
    { list: topology.routers,      type: 'router'      },
    { list: topology.patch_panels, type: 'patch_panel' },
    { list: topology.wall_panels,  type: 'wall_panel'  },
  ]
  for (const { list, type } of checks) {
    const entity = list.find((e) => e.id === id)
    if (entity) return { entity, type }
  }
  return null
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [topology, setTopology] = useState<Topology | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Selected entity (sidebar click or graph node click)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  // Form state: either editing an existing entity or creating a new one
  const [formState, setFormState] = useState<{
    open: boolean
    type: EntityType
    entityId: string | null
  } | null>(null)

  const [yamlOpen, setYamlOpen] = useState(false)
  const [cablesOpen, setCablesOpen] = useState(false)

  const [pendingConnection, setPendingConnection] = useState<{
    sourceId: string
    targetId: string
  } | null>(null)

  // Load topology on mount
  useEffect(() => {
    fetchTopology()
      .then((t) => {
        setTopology(t)
        setLoading(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  // Graph node click: select (trace highlight) without opening the form
  const handleNodeSelect = useCallback((id: string) => {
    setSelectedEntityId(id || null)
  }, [])

  // Sidebar click or pencil icon: open the edit form
  const handleSelectEntity = useCallback((id: string) => {
    setSelectedEntityId(id)
    if (topology) {
      const found = findEntityById(topology, id)
      if (found) {
        setFormState({ open: true, type: found.type, entityId: id })
      }
    }
  }, [topology])

  const handleAddEntity = useCallback((type: EntityType) => {
    setSelectedEntityId(null)
    setFormState({ open: true, type, entityId: null })
  }, [])

  const handleFormSaved = useCallback((updated: Topology) => {
    setTopology(updated)
  }, [])

  const handleFormClose = useCallback(() => {
    setFormState(null)
  }, [])

  // Highlight the full cable run for selected devices only; passthroughs and
  // terminals highlighted when reached via traversal, not when clicked directly
  const highlightedConnectionIds = useMemo(() => {
    if (!topology || !selectedEntityId) return undefined
    const found = findEntityById(topology, selectedEntityId)
    if (!found || found.type === 'patch_panel' || found.type === 'wall_panel') return undefined
    return traceCableRun(topology, selectedEntityId)
  }, [topology, selectedEntityId])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-400 text-sm">
        Loading topology…
      </div>
    )
  }

  if (error || !topology) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 gap-4">
        <p className="text-red-400 text-sm">
          Failed to load topology: {error ?? 'Unknown error'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const formEntity =
    formState?.entityId && topology
      ? findEntityById(topology, formState.entityId)?.entity ?? null
      : null

  return (
    <div className="flex h-screen bg-gray-900 overflow-hidden">
      {/* Left sidebar */}
      <Sidebar
        topology={topology}
        selectedEntityId={selectedEntityId}
        onSelectEntity={handleSelectEntity}
        onAddEntity={handleAddEntity}
        onShowYaml={() => setYamlOpen(true)}
        onShowCables={() => setCablesOpen(true)}
      />

      {/* Main canvas */}
      <main className="flex-1 relative">
        <TopologyGraph
          topology={topology}
          selectedEntityId={selectedEntityId}
          onNodeClick={handleNodeSelect}
          onNodeEdit={handleSelectEntity}
          onConnect={(sourceId, targetId) => setPendingConnection({ sourceId, targetId })}
          highlightedConnectionIds={highlightedConnectionIds}
        />
      </main>

      {/* Entity form modal */}
      {formState?.open && (
        <EntityForm
          entityType={formState.type}
          existingEntity={formEntity}
          topology={topology}
          onSaved={handleFormSaved}
          onDeleted={(updated) => { setTopology(updated); setSelectedEntityId(null); setFormState(null) }}
          onClose={handleFormClose}
        />
      )}

      {/* Connection form modal */}
      {pendingConnection && (
        <ConnectionForm
          sourceId={pendingConnection.sourceId}
          targetId={pendingConnection.targetId}
          topology={topology}
          onSaved={(updated) => { setTopology(updated); setPendingConnection(null) }}
          onClose={() => setPendingConnection(null)}
        />
      )}

      {/* Cable list modal */}
      {cablesOpen && (
        <CableList
          topology={topology}
          onSaved={(updated) => setTopology(updated)}
          onClose={() => setCablesOpen(false)}
        />
      )}

      {/* YAML editor modal */}
      {yamlOpen && (
        <YamlModal
          onClose={() => setYamlOpen(false)}
          onSaved={(updated) => { setTopology(updated); setYamlOpen(false) }}
        />
      )}
    </div>
  )
}
