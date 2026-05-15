import React, { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type EdgeProps,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ELK from 'elkjs/lib/elk.bundled.js'
import { Pencil } from 'lucide-react'
import type { Topology, AnyEntity } from '../types/topology'

// ---------------------------------------------------------------------------
// Custom node
// ---------------------------------------------------------------------------

interface NodeData {
  label: string
  typeLabel: string
  colorClass: string
  isSelected: boolean
  onEdit: () => void
  [key: string]: unknown
}

function EntityNode({ data }: { data: NodeData }) {
  return (
    <div
      className={`${data.colorClass} rounded-lg px-4 py-2 shadow-lg border min-w-[120px] text-center relative transition-all ${
        data.isSelected ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-white/20'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/40 !border-white/60" />
      <div className="text-white font-semibold text-sm leading-tight">{data.label}</div>
      <div className="text-white/70 text-xs mt-0.5">{data.typeLabel}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-white/40 !border-white/60" />
      {data.isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onEdit() }}
          className="absolute -top-2.5 -right-2.5 bg-sky-500 hover:bg-sky-400 rounded-full p-1 shadow-lg transition-colors"
          title="Edit entity"
        >
          <Pencil size={10} className="text-white" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom edge — renders ELK-computed waypoints as a polyline
// ---------------------------------------------------------------------------

interface WaypointEdgeData {
  waypoints?: { x: number; y: number }[]
  fromPortId?: string
  toPortId?: string
  [key: string]: unknown
}

function offsetAlongSegment(
  from: { x: number; y: number },
  toward: { x: number; y: number },
  px: number
): { x: number; y: number } {
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return { x: from.x + (dx / len) * px, y: from.y + (dy / len) * px }
}

function WaypointEdge({ data, style, markerEnd, animated }: EdgeProps) {
  const d = data as WaypointEdgeData
  const pts = d?.waypoints
  const fromPortId = d?.fromPortId
  const toPortId   = d?.toPortId

  if (!pts || pts.length < 2) return null

  const svgPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  // Place port labels 24px along the line from each endpoint
  const fromLabelPos = offsetAlongSegment(pts[0], pts[1], 24)
  const toLabelPos   = offsetAlongSegment(pts[pts.length - 1], pts[pts.length - 2], 24)

  return (
    <>
      <BaseEdge path={svgPath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {animated && fromPortId && (
          <div
            style={{ transform: `translate(-50%, -50%) translate(${fromLabelPos.x}px, ${fromLabelPos.y}px)` }}
            className="absolute pointer-events-none bg-sky-950 text-sky-300 text-xs px-1.5 py-0.5 rounded border border-sky-700/60 nodrag nopan"
          >
            {fromPortId}
          </div>
        )}
        {animated && toPortId && (
          <div
            style={{ transform: `translate(-50%, -50%) translate(${toLabelPos.x}px, ${toLabelPos.y}px)` }}
            className="absolute pointer-events-none bg-sky-950 text-sky-300 text-xs px-1.5 py-0.5 rounded border border-sky-700/60 nodrag nopan"
          >
            {toPortId}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes: NodeTypes = { entity: EntityNode as unknown as NodeTypes[string] }
const edgeTypes: EdgeTypes = { waypoint: WaypointEdge as unknown as EdgeTypes[string] }

// ---------------------------------------------------------------------------
// Node metadata
// ---------------------------------------------------------------------------

const ENTITY_META: Record<string, { typeLabel: string; colorClass: string }> = {
  routers:      { typeLabel: 'Router',      colorClass: 'bg-purple-600' },
  switches:     { typeLabel: 'Switch',      colorClass: 'bg-green-600'  },
  patch_panels: { typeLabel: 'Patch Panel', colorClass: 'bg-orange-500' },
  wall_panels:  { typeLabel: 'Wall Panel',  colorClass: 'bg-yellow-500' },
  devices:      { typeLabel: 'Device',      colorClass: 'bg-blue-600'   },
}

const NODE_W = 160
const NODE_H = 52
const elk = new ELK()

// ---------------------------------------------------------------------------
// ELK layout
// ---------------------------------------------------------------------------

async function runElkLayout(topology: Topology): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const rawNodes: Node[] = []

  for (const [key, meta] of Object.entries(ENTITY_META)) {
    const entities = topology[key as keyof Topology] as AnyEntity[]
    for (const entity of entities) {
      rawNodes.push({
        id: entity.id,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: { label: entity.name, typeLabel: meta.typeLabel, colorClass: meta.colorClass },
      })
    }
  }

  const nodeIds = new Set(rawNodes.map((n) => n.id))

  // Collect edges, deduplicating pairs for layout while keeping all for display
  const layoutEdges: { id: string; sources: string[]; targets: string[] }[] = []
  const displayEdges: Edge[] = []
  const seenPairs = new Set<string>()

  for (const conn of topology.connections) {
    const src = conn.from.entity_id
    const tgt = conn.to.entity_id
    if (!nodeIds.has(src) || !nodeIds.has(tgt)) continue

    displayEdges.push({
      id: conn.id,
      source: src,
      target: tgt,
      type: 'waypoint',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 2 },
      data: {
        fromPortId: conn.from.port_id,
        toPortId: conn.to.port_id,
        waypoints: [],
      },
    })

    const pairKey = [src, tgt].sort().join('→')
    if (!seenPairs.has(pairKey)) {
      layoutEdges.push({ id: conn.id, sources: [src], targets: [tgt] })
      seenPairs.add(pairKey)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elkGraph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '60',
      'elk.spacing.edgeNode': '40',
      'elk.spacing.edgeEdge': '20',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.unnecessaryBendpoints': 'true',
      'elk.padding': '[top=40, left=40, bottom=40, right=40]',
    },
    children: rawNodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: layoutEdges,
  }

  const laid = await elk.layout(elkGraph)

  // Build waypoint lookup from ELK's edge sections
  const waypointMap = new Map<string, { x: number; y: number }[]>()
  for (const e of (laid.edges ?? []) as any[]) {
    if (!e.sections?.length) continue
    const section = e.sections[0]
    const pts: { x: number; y: number }[] = [section.startPoint]
    if (section.bendPoints) pts.push(...section.bendPoints)
    pts.push(section.endPoint)
    waypointMap.set(e.id, pts)
  }

  const nodes: Node[] = rawNodes.map((node) => {
    const elkNode = laid.children?.find((c: any) => c.id === node.id)
    return { ...node, position: { x: elkNode?.x ?? 0, y: elkNode?.y ?? 0 } }
  })

  // For edges that share a pair (deduped for layout), derive waypoints from
  // the canonical edge that ELK actually routed.
  const edges: Edge[] = displayEdges.map((edge) => {
    const src = edge.source as string
    const tgt = edge.target as string
    const pairKey = [src, tgt].sort().join('→')

    // Find the canonical edge id ELK routed for this pair
    const canonicalId = layoutEdges.find(
      (le) => [le.sources[0], le.targets[0]].sort().join('→') === pairKey
    )?.id

    const waypoints = (canonicalId ? waypointMap.get(canonicalId) : undefined) ?? []
    return { ...edge, data: { ...(edge.data ?? {}), waypoints } }
  })

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TopologyGraphProps {
  topology: Topology
  selectedEntityId?: string | null
  onNodeClick?: (entityId: string) => void
  onNodeEdit?: (entityId: string) => void
  onConnect?: (sourceId: string, targetId: string) => void
  highlightedConnectionIds?: Set<string>
}

export default function TopologyGraph({
  topology, selectedEntityId, onNodeClick, onNodeEdit, onConnect, highlightedConnectionIds,
}: TopologyGraphProps) {
  const [layoutResult, setLayoutResult] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    runElkLayout(topology).then((result) => {
      if (!cancelled) setLayoutResult(result)
    })
    return () => { cancelled = true }
  }, [topology])

  const rawNodes = layoutResult?.nodes ?? []
  const baseEdges = layoutResult?.edges ?? []

  const nodes = rawNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isSelected: node.id === selectedEntityId,
      onEdit: () => onNodeEdit?.(node.id),
    },
  }))

  const edges = (() => {
    if (!highlightedConnectionIds || highlightedConnectionIds.size === 0) return baseEdges
    return baseEdges.map((edge) => {
      const highlighted = highlightedConnectionIds.has(edge.id)
      return {
        ...edge,
        animated: highlighted,
        style: highlighted
          ? { stroke: '#38bdf8', strokeWidth: 3 }
          : { stroke: '#334155', strokeWidth: 1, opacity: 0.3 },
      }
    })
  })()

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id)
  }, [onNodeClick])

  const handleConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      onConnect?.(connection.source, connection.target)
    }
  }, [onConnect])

  const handlePaneClick = useCallback(() => {
    onNodeClick?.('')
  }, [onNodeClick])

  if (!layoutResult) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <span className="text-gray-500 text-sm">Laying out graph…</span>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#334155" gap={24} size={1.5} />
        <Controls className="!bg-gray-800 !border-gray-700 [&_button]:!bg-gray-700 [&_button]:!border-gray-600 [&_button]:!text-gray-300" />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as NodeData
            const map: Record<string, string> = {
              'bg-blue-600':   '#2563eb',
              'bg-green-600':  '#16a34a',
              'bg-purple-600': '#9333ea',
              'bg-orange-500': '#f97316',
              'bg-yellow-500': '#eab308',
            }
            return map[d.colorClass] ?? '#64748b'
          }}
          className="!bg-gray-800 !border-gray-700"
          maskColor="rgba(15,23,42,0.6)"
        />
      </ReactFlow>
    </div>
  )
}
