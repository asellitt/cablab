import React, { useState } from 'react'
import { X, Trash2, Cable } from 'lucide-react'
import type { Topology, Connection } from '../types/topology'
import { getAllEntities } from './ConnectionForm'
import { saveTopology } from '../api/client'

interface CableListProps {
  topology: Topology
  onSaved: (topology: Topology) => void
  onClose: () => void
}

export default function CableList({ topology, onSaved, onClose }: CableListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const entities = getAllEntities(topology)
  function entityName(id: string) {
    return entities.find((e) => e.id === id)?.name ?? id
  }

  async function handleDelete(conn: Connection) {
    setDeletingId(conn.id)
    setError(null)
    try {
      const updated = { ...topology, connections: topology.connections.filter((c) => c.id !== conn.id) }
      const saved = await saveTopology(updated)
      onSaved(saved)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Cable size={16} className="text-blue-400" />
            <h2 className="text-white font-semibold text-base">
              Cables{' '}
              <span className="text-gray-500 font-normal text-sm">({topology.connections.length})</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {topology.connections.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">No cables yet.</p>
          )}
          {[...topology.connections]
            .sort((a, b) => {
              const nameA = entityName(a.from.entity_id)
              const nameB = entityName(b.from.entity_id)
              return nameA !== nameB
                ? nameA.localeCompare(nameB)
                : a.from.port_id.localeCompare(b.from.port_id)
            })
            .map((conn) => (
            <div key={conn.id} className="flex items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2.5 group">
              <div className="flex-1 min-w-0 text-sm">
                <span className="text-blue-300">{entityName(conn.from.entity_id)}</span>
                <span className="text-gray-500 mx-1">·</span>
                <span className="text-gray-300">{conn.from.port_id}</span>
                {conn.from.side && (
                  <span className="text-gray-600 text-xs ml-1">({conn.from.side})</span>
                )}
                <span className="text-gray-500 mx-2">→</span>
                <span className="text-blue-300">{entityName(conn.to.entity_id)}</span>
                <span className="text-gray-500 mx-1">·</span>
                <span className="text-gray-300">{conn.to.port_id}</span>
                {conn.to.side && (
                  <span className="text-gray-600 text-xs ml-1">({conn.to.side})</span>
                )}
              </div>
              <button
                onClick={() => handleDelete(conn)}
                disabled={deletingId === conn.id}
                className="p-1.5 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                title="Delete cable"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-lg px-3 py-2 border border-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
