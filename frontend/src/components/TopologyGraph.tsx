import React, { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
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
import { vlanColor, buildConnectionVlanMap, getAllVlans } from '../utils/vlanColors'

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

const fullSizeHandleStyle: React.CSSProperties = {
  opacity: 0,
  width: '100%',
  height: '100%',
  top: 0,
  left: 0,
  borderRadius: 'inherit',
  transform: 'none',
  cursor: 'crosshair',
}

function EntityNode({ data }: { data: NodeData }) {
  return (
    <div
      className={`${data.colorClass} rounded-lg px-3 py-2 shadow-lg border text-center relative transition-all ${
        data.isSelected ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-white/20'
      }`}
      style={{ width: NODE_W, boxSizing: 'border-box' }}
    >
      <Handle type="target" position={Position.Top} style={fullSizeHandleStyle} />
      <div className="text-white font-semibold text-sm leading-tight pointer-events-none break-words">{data.label}</div>
      <div className="text-white/70 text-xs mt-0.5 pointer-events-none">{data.typeLabel}</div>
      <Handle type="source" position={Position.Bottom} style={fullSizeHandleStyle} />
      {data.isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onEdit() }}
          className="absolute -top-2.5 -right-2.5 bg-sky-500 hover:bg-sky-400 rounded-full p-1 shadow-lg transition-colors"
          style={{ zIndex: 10 }}
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

// ---------------------------------------------------------------------------
// Room node — background bounding box
// ---------------------------------------------------------------------------

interface RoomNodeData {
  label: string
  [key: string]: unknown
}

function RoomNode({ data }: { data: RoomNodeData }) {
  return (
    <div
      className="w-full h-full rounded-xl border-2 border-dashed border-white/20 bg-white/[0.03] pointer-events-none"
      style={{ boxSizing: 'border-box' }}
    >
      <span className="absolute top-2 left-3 text-white/40 text-xs font-semibold uppercase tracking-widest select-none">
        {data.label}
      </span>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  entity: EntityNode as unknown as NodeTypes[string],
  room:   RoomNode   as unknown as NodeTypes[string],
}
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
const NODE_H = 64
const elk = new ELK()

// ---------------------------------------------------------------------------
// ELK layout
// ---------------------------------------------------------------------------

async function runElkLayout(topology: Topology): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Collect all entities with their metadata
  type RawEntity = { id: string; name: string; meta: typeof ENTITY_META[string]; location: string | null }
  const rawEntities: RawEntity[] = []

  for (const [key, meta] of Object.entries(ENTITY_META)) {
    const entities = topology[key as keyof Topology] as AnyEntity[]
    for (const entity of entities) {
      rawEntities.push({
        id: entity.id,
        name: entity.name,
        meta,
        location: ('location' in entity ? entity.location : undefined) ?? null,
      })
    }
  }

  const nodeIds = new Set(rawEntities.map((n) => n.id))

  // Group entities by room
  const roomGroups = new Map<string, RawEntity[]>()  // location → entities
  const noRoom: RawEntity[] = []
  const entityToRoom = new Map<string, string>()     // entityId → __room__<label>

  for (const e of rawEntities) {
    if (e.location) {
      const roomId = `__room__${e.location}`
      if (!roomGroups.has(roomId)) roomGroups.set(roomId, [])
      roomGroups.get(roomId)!.push(e)
      entityToRoom.set(e.id, roomId)
    } else {
      noRoom.push(e)
    }
  }

  // Build display edges and deduplicated layout edges
  const displayEdges: Edge[] = []
  const layoutEdges: { id: string; sources: string[]; targets: string[] }[] = []
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
      data: { fromPortId: conn.from.port_id, toPortId: conn.to.port_id, waypoints: [] },
    })

    const pairKey = [src, tgt].sort().join('→')
    if (!seenPairs.has(pairKey)) {
      layoutEdges.push({ id: conn.id, sources: [src], targets: [tgt] })
      seenPairs.add(pairKey)
    }
  }

  // Partition layout edges: intra-room edges go inside their room node;
  // inter-room and no-room edges go at root.
  const intraRoomEdges = new Map<string, typeof layoutEdges>()
  const rootLayoutEdges: typeof layoutEdges = []

  for (const le of layoutEdges) {
    const srcRoom = entityToRoom.get(le.sources[0])
    const tgtRoom = entityToRoom.get(le.targets[0])
    if (srcRoom && tgtRoom && srcRoom === tgtRoom) {
      if (!intraRoomEdges.has(srcRoom)) intraRoomEdges.set(srcRoom, [])
      intraRoomEdges.get(srcRoom)!.push(le)
    } else {
      rootLayoutEdges.push(le)
    }
  }

  const ROOM_PAD = 40
  const ROOM_LAYOUT_OPTS = {
    'elk.algorithm':                              'layered',
    'elk.direction':                              'DOWN',
    'elk.spacing.nodeNode':                       '40',
    'elk.layered.spacing.nodeNodeBetweenLayers':  '60',
    'elk.edgeRouting':                            'ORTHOGONAL',
    'elk.padding':                                `[top=${ROOM_PAD}, left=${ROOM_PAD}, bottom=${ROOM_PAD}, right=${ROOM_PAD}]`,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elkGraph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm':                              'layered',
      'elk.direction':                              'DOWN',
      'elk.hierarchyHandling':                      'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers':  '80',
      'elk.spacing.nodeNode':                       '60',
      'elk.spacing.edgeNode':                       '40',
      'elk.spacing.edgeEdge':                       '20',
      'elk.layered.nodePlacement.strategy':         'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy':  'LAYER_SWEEP',
      'elk.edgeRouting':                            'ORTHOGONAL',
      'elk.layered.unnecessaryBendpoints':          'true',
      'elk.padding':                                '[top=40, left=40, bottom=40, right=40]',
    },
    children: [
      // Room compound nodes
      ...Array.from(roomGroups.entries()).map(([roomId, entities]) => ({
        id: roomId,
        layoutOptions: ROOM_LAYOUT_OPTS,
        children: entities.map((e) => ({ id: e.id, width: NODE_W, height: NODE_H })),
        edges: intraRoomEdges.get(roomId) ?? [],
      })),
      // Free-standing (no room) entities
      ...noRoom.map((e) => ({ id: e.id, width: NODE_W, height: NODE_H })),
    ],
    edges: rootLayoutEdges,
  }

  const laid = await elk.layout(elkGraph)

  // Collect waypoints from all levels of the laid-out graph.
  // Root-level edges use absolute coords; room-level edges use room-local
  // coords and must be offset by the room's absolute position.
  const waypointMap = new Map<string, { x: number; y: number }[]>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function collectEdgeWaypoints(edges: any[], offsetX: number, offsetY: number) {
    for (const e of edges ?? []) {
      if (!e.sections?.length) continue
      const section = e.sections[0]
      const pts: { x: number; y: number }[] = [
        { x: section.startPoint.x + offsetX, y: section.startPoint.y + offsetY },
        ...(section.bendPoints ?? []).map((p: { x: number; y: number }) => ({ x: p.x + offsetX, y: p.y + offsetY })),
        { x: section.endPoint.x + offsetX, y: section.endPoint.y + offsetY },
      ]
      waypointMap.set(e.id, pts)
    }
  }

  collectEdgeWaypoints(laid.edges ?? [], 0, 0)

  // Absolute positions for all entity nodes
  const posMap = new Map<string, { x: number; y: number }>()
  // Room bounding boxes for React Flow room nodes
  const roomBBox = new Map<string, { x: number; y: number; width: number; height: number }>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const child of (laid.children ?? []) as any[]) {
    const cx = child.x ?? 0
    const cy = child.y ?? 0

    if (child.id.startsWith('__room__')) {
      roomBBox.set(child.id, { x: cx, y: cy, width: child.width ?? 200, height: child.height ?? 200 })
      // Collect intra-room edge waypoints (room-local coordinates → offset to absolute)
      collectEdgeWaypoints(child.edges ?? [], cx, cy)
      // Absolute positions for entities inside this room
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const grandchild of (child.children ?? []) as any[]) {
        posMap.set(grandchild.id, { x: cx + (grandchild.x ?? 0), y: cy + (grandchild.y ?? 0) })
      }
    } else {
      posMap.set(child.id, { x: cx, y: cy })
    }
  }

  const entityNodes: Node[] = rawEntities.map((e) => ({
    id: e.id,
    type: 'entity',
    position: posMap.get(e.id) ?? { x: 0, y: 0 },
    data: { label: e.name, typeLabel: e.meta.typeLabel, colorClass: e.meta.colorClass, location: e.location },
    zIndex: 1,
  }))

  const roomNodes: Node[] = Array.from(roomBBox.entries()).map(([id, bbox]) => ({
    id,
    type: 'room',
    position: { x: bbox.x, y: bbox.y },
    style:    { width: bbox.width, height: bbox.height },
    data:     { label: id.replace('__room__', '') },
    zIndex:   0,
    selectable: false,
    draggable:  false,
    connectable: false,
  }))

  const nodes: Node[] = [...roomNodes, ...entityNodes]

  // Resolve waypoints for display edges via canonical layout edge
  const edges: Edge[] = displayEdges.map((edge) => {
    const src = edge.source as string
    const tgt = edge.target as string
    const pairKey = [src, tgt].sort().join('→')
    const canonicalId = layoutEdges.find(
      (le) => [le.sources[0], le.targets[0]].sort().join('→') === pairKey
    )?.id
    const waypoints = (canonicalId ? waypointMap.get(canonicalId) : undefined) ?? []
    return { ...edge, data: { ...(edge.data ?? {}), waypoints } }
  })

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// VLAN legend
// ---------------------------------------------------------------------------

function VlanLegend({ vlans }: { vlans: string[] }) {
  if (vlans.length <= 1) return null // only 'default' — no point showing
  return (
    <div className="absolute bottom-4 right-4 z-10 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 text-xs space-y-1 pointer-events-none">
      <p className="text-gray-400 font-semibold mb-1 uppercase tracking-widest text-[10px]">VLANs</p>
      {vlans.map((vlan) => (
        <div key={vlan} className="flex items-center gap-2">
          <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: vlanColor(vlan) }} />
          <span className="text-gray-300">{vlan}</span>
        </div>
      ))}
    </div>
  )
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

  const vlanMap  = buildConnectionVlanMap(topology)
  const allVlans = getAllVlans(topology)

  const nodes = rawNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isSelected: node.id === selectedEntityId,
      onEdit: () => onNodeEdit?.(node.id),
    },
  }))

  const edges = (() => {
    const hasHighlight = highlightedConnectionIds && highlightedConnectionIds.size > 0
    return baseEdges.map((edge) => {
      const vlan  = vlanMap.get(edge.id) ?? 'default'
      const color = vlanColor(vlan)
      if (!hasHighlight) {
        return { ...edge, animated: false, style: { stroke: color, strokeWidth: 2 } }
      }
      const highlighted = highlightedConnectionIds!.has(edge.id)
      return {
        ...edge,
        animated: highlighted,
        style: highlighted
          ? { stroke: color, strokeWidth: 3 }
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
    <div className="w-full h-full relative">
      <VlanLegend vlans={allVlans} />
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
      </ReactFlow>
    </div>
  )
}
