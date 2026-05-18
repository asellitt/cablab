import React, { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  ConnectionMode,
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
import { Pencil, PlugZap } from 'lucide-react'
import type { Topology, AnyEntity } from '../types/topology'
import { vlanColor, buildConnectionVlanMap, getAllVlans } from '../utils/vlanColors'
import { useTouchGestures } from '../utils/useTouchGestures'

// ---------------------------------------------------------------------------
// Custom node — terminal entities (devices, switches, routers)
// ---------------------------------------------------------------------------

interface NodeData {
  label: string
  typeLabel: string
  colorClass: string
  isSelected: boolean
  onEdit: () => void
  onView: () => void
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
  const { onTouchStart, onTouchEnd, onTouchMove } = useTouchGestures(() => {}, data.onView, data.onEdit)
  return (
    <div
      className={`${data.colorClass} rounded-lg px-3 py-2 shadow-lg border text-center relative transition-all ${
        data.isSelected ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-white/20'
      }`}
      style={{ width: NODE_W, boxSizing: 'border-box' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
    >
      <Handle type="target" position={Position.Top} style={fullSizeHandleStyle} />
      <div className="text-white font-semibold text-sm leading-tight pointer-events-none break-words">{data.label}</div>
      <div className="text-white/70 text-xs mt-0.5 pointer-events-none">{data.typeLabel}</div>
      <Handle type="source" position={Position.Bottom} style={fullSizeHandleStyle} />
      {data.isSelected && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); data.onEdit() }}
            className="absolute -top-3.5 -right-3.5 bg-sky-500 hover:bg-sky-400 rounded-full p-1.5 shadow-lg transition-colors"
            style={{ zIndex: 10 }}
            title="Edit entity"
          >
            <Pencil size={13} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onView() }}
            className="absolute -bottom-3.5 -right-3.5 bg-sky-500 hover:bg-sky-400 rounded-full p-1.5 shadow-lg transition-colors"
            style={{ zIndex: 10 }}
            title="View ports"
          >
            <PlugZap size={13} className="text-white" />
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Passthrough node — patch panels and wall panels
// B (back) on the left/WEST, F (front) on the right/EAST
// ---------------------------------------------------------------------------

const westHandleStyle: React.CSSProperties = {
  opacity: 0,
  width: '40%',
  height: '100%',
  top: 0,
  left: 0,
  transform: 'none',
  cursor: 'crosshair',
  borderRadius: 0,
}

const eastHandleStyle: React.CSSProperties = {
  opacity: 0,
  width: '40%',
  height: '100%',
  top: 0,
  right: 0,
  left: 'auto',
  transform: 'none',
  cursor: 'crosshair',
  borderRadius: 0,
}

function PassthroughNode({ data }: { data: NodeData }) {
  const { onTouchStart, onTouchEnd, onTouchMove } = useTouchGestures(data.onEdit, data.onView)
  return (
    <div
      className={`${data.colorClass} rounded-lg shadow-lg border relative transition-all flex items-stretch ${
        data.isSelected ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-white/20'
      }`}
      style={{ width: PASSTHROUGH_W, boxSizing: 'border-box' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
    >
      {/* Back / WEST handle — id="back" */}
      <Handle id="back" type="source" position={Position.Left} style={westHandleStyle} />

      {/* Back label */}
      <div className="flex items-center justify-center shrink-0 px-2 border-r border-white/20">
        <span className="text-white/50 text-[10px] font-bold uppercase tracking-wide pointer-events-none">B</span>
      </div>

      {/* Centre — name + type */}
      <div className="flex-1 flex flex-col items-center justify-center px-2 py-2 text-center min-w-0">
        <div className="text-white font-semibold text-sm leading-tight pointer-events-none break-words w-full">{data.label}</div>
        <div className="text-white/70 text-xs mt-0.5 pointer-events-none">{data.typeLabel}</div>
      </div>

      {/* Front label */}
      <div className="flex items-center justify-center shrink-0 px-2 border-l border-white/20">
        <span className="text-white/50 text-[10px] font-bold uppercase tracking-wide pointer-events-none">F</span>
      </div>

      {/* Front / EAST handle — id="front" */}
      <Handle id="front" type="source" position={Position.Right} style={eastHandleStyle} />

      {data.isSelected && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); data.onEdit() }}
            className="absolute -top-3.5 -right-3.5 bg-sky-500 hover:bg-sky-400 rounded-full p-1.5 shadow-lg transition-colors"
            style={{ zIndex: 10 }}
            title="Edit entity"
          >
            <Pencil size={13} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); data.onView() }}
            className="absolute -bottom-3.5 -right-3.5 bg-sky-500 hover:bg-sky-400 rounded-full p-1.5 shadow-lg transition-colors"
            style={{ zIndex: 10 }}
            title="View ports"
          >
            <PlugZap size={13} className="text-white" />
          </button>
        </>
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

  const fromLabelPos = offsetAlongSegment(pts[0], pts[1], 24)
  const toLabelPos   = offsetAlongSegment(pts[pts.length - 1], pts[pts.length - 2], 24)

  const labelCls = 'absolute pointer-events-none bg-sky-950 text-sky-300 text-xs px-1.5 py-0.5 rounded border border-sky-700/60 nodrag nopan'

  return (
    <>
      <BaseEdge path={svgPath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {animated && fromPortId && (
          <div
            style={{ transform: `translate(-50%, -50%) translate(${fromLabelPos.x}px, ${fromLabelPos.y}px)` }}
            className={labelCls}
          >
            {fromPortId}
          </div>
        )}
        {animated && toPortId && (
          <div
            style={{ transform: `translate(-50%, -50%) translate(${toLabelPos.x}px, ${toLabelPos.y}px)` }}
            className={labelCls}
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
  entity:      EntityNode      as unknown as NodeTypes[string],
  passthrough: PassthroughNode as unknown as NodeTypes[string],
  room:        RoomNode        as unknown as NodeTypes[string],
}
const edgeTypes: EdgeTypes = { waypoint: WaypointEdge as unknown as EdgeTypes[string] }

// ---------------------------------------------------------------------------
// Node metadata
// ---------------------------------------------------------------------------

const ENTITY_META: Record<string, { typeLabel: string; colorClass: string; isPassthrough: boolean }> = {
  routers:      { typeLabel: 'Router',      colorClass: 'bg-purple-600', isPassthrough: false },
  switches:     { typeLabel: 'Switch',      colorClass: 'bg-green-600',  isPassthrough: false },
  patch_panels: { typeLabel: 'Patch Panel', colorClass: 'bg-orange-500', isPassthrough: true  },
  wall_panels:  { typeLabel: 'Wall Panel',  colorClass: 'bg-yellow-500', isPassthrough: true  },
  devices:      { typeLabel: 'Device',      colorClass: 'bg-blue-600',   isPassthrough: false },
}

const NODE_W        = 160
const PASSTHROUGH_W = 220
const NODE_H        = 64
const elk = new ELK()

// ---------------------------------------------------------------------------
// ELK layout
// ---------------------------------------------------------------------------

async function runElkLayout(topology: Topology): Promise<{ nodes: Node[]; edges: Edge[] }> {
  type RawEntity = {
    id: string
    name: string
    meta: typeof ENTITY_META[string]
    location: string | null
    isPassthrough: boolean
  }
  const rawEntities: RawEntity[] = []

  for (const [key, meta] of Object.entries(ENTITY_META)) {
    const entities = topology[key as keyof Topology] as AnyEntity[]
    for (const entity of entities) {
      rawEntities.push({
        id: entity.id,
        name: entity.name,
        meta,
        location: ('location' in entity ? entity.location : undefined) ?? null,
        isPassthrough: meta.isPassthrough,
      })
    }
  }

  const nodeIds = new Set(rawEntities.map((n) => n.id))

  // Group entities by room
  const roomGroups = new Map<string, RawEntity[]>()
  const noRoom: RawEntity[] = []
  const entityToRoom = new Map<string, string>()

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

  // Normalize layout edge direction so ELK places nodes on the correct side of
  // passthrough nodes. In a RIGHT-direction layout, sources sit LEFT of targets.
  // Rule: anything connecting to a passthrough's BACK must be to its LEFT (source),
  //       anything connecting to a passthrough's FRONT must be to its RIGHT (target).
  //   conn.to.side === 'back'  → from is already left of to  → no flip
  //   conn.to.side === 'front' → from must end up RIGHT of to → flip
  //   conn.from.side === 'front' → from is left of to          → no flip
  //   conn.from.side === 'back'  → from must end up RIGHT of to → flip
  function normalizeLayoutEdge(conn: typeof topology.connections[0]): {
    sources: string[]; targets: string[]; flipped: boolean
  } {
    const flip = conn.to.side === 'front' || conn.from.side === 'back'
    return flip
      ? { sources: [conn.to.entity_id],   targets: [conn.from.entity_id], flipped: true  }
      : { sources: [conn.from.entity_id], targets: [conn.to.entity_id],   flipped: false }
  }

  // Build display edges and layout edges — one layout edge per connection so
  // every cable gets its own ELK-routed path.
  const displayEdges: Edge[] = []
  const layoutEdges: { id: string; sources: string[]; targets: string[] }[] = []
  const layoutEdgeFlipped = new Map<string, boolean>()

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
        fromPortId: conn.from.port_id + (conn.from.side ? conn.from.side[0].toUpperCase() : ''),
        toPortId:   conn.to.port_id   + (conn.to.side   ? conn.to.side[0].toUpperCase()   : ''),
        waypoints: [],
      },
    })

    const { sources, targets, flipped } = normalizeLayoutEdge(conn)
    layoutEdges.push({ id: conn.id, sources, targets })
    layoutEdgeFlipped.set(conn.id, flipped)
  }

  // Partition layout edges into intra-room and root-level
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

  const ROOM_PAD = 50
  const ROOM_LAYOUT_OPTS = {
    'elk.algorithm':                              'layered',
    'elk.direction':                              'RIGHT',
    'elk.spacing.nodeNode':                       '80',
    'elk.layered.spacing.nodeNodeBetweenLayers':  '100',
    'elk.edgeRouting':                            'ORTHOGONAL',
    'elk.padding':                                `[top=${ROOM_PAD}, left=${ROOM_PAD}, bottom=${ROOM_PAD}, right=${ROOM_PAD}]`,
  }

  function elkNodeSpec(e: RawEntity) {
    return { id: e.id, width: e.isPassthrough ? PASSTHROUGH_W : NODE_W, height: NODE_H }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elkGraph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm':                              'layered',
      'elk.direction':                              'RIGHT',
      'elk.hierarchyHandling':                      'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers':  '120',
      'elk.spacing.nodeNode':                       '80',
      'elk.spacing.edgeNode':                       '60',
      'elk.spacing.edgeEdge':                       '40',
      'elk.layered.nodePlacement.strategy':         'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy':  'LAYER_SWEEP',
      'elk.edgeRouting':                            'ORTHOGONAL',
      'elk.layered.unnecessaryBendpoints':          'true',
      'elk.padding':                                '[top=40, left=40, bottom=40, right=40]',
    },
    children: [
      ...Array.from(roomGroups.entries()).map(([roomId, entities]) => ({
        id: roomId,
        layoutOptions: ROOM_LAYOUT_OPTS,
        children: entities.map(elkNodeSpec),
        edges: intraRoomEdges.get(roomId) ?? [],
      })),
      ...noRoom.map(elkNodeSpec),
    ],
    edges: rootLayoutEdges,
  }

  const laid = await elk.layout(elkGraph)

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

  const posMap = new Map<string, { x: number; y: number }>()
  const roomBBox = new Map<string, { x: number; y: number; width: number; height: number }>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const child of (laid.children ?? []) as any[]) {
    const cx = child.x ?? 0
    const cy = child.y ?? 0

    if (child.id.startsWith('__room__')) {
      roomBBox.set(child.id, { x: cx, y: cy, width: child.width ?? 200, height: child.height ?? 200 })
      collectEdgeWaypoints(child.edges ?? [], cx, cy)
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
    type: e.isPassthrough ? 'passthrough' : 'entity',
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

  const edges: Edge[] = displayEdges.map((edge) => {
    const flipped = layoutEdgeFlipped.get(edge.id) ?? false
    let waypoints = waypointMap.get(edge.id) ?? []
    if (flipped && waypoints.length >= 2) waypoints = [...waypoints].reverse()
    return { ...edge, data: { ...(edge.data ?? {}), waypoints } }
  })

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// VLAN legend
// ---------------------------------------------------------------------------

function VlanLegend({ vlans }: { vlans: string[] }) {
  if (vlans.length <= 1) return null
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
  onNodeView?: (entityId: string) => void
  onConnect?: (sourceId: string, targetId: string) => void
  highlightedConnectionIds?: Set<string>
  showPortLabels?: boolean
  showVlanLegend?: boolean
  connectable?: boolean
}

export default function TopologyGraph({
  topology, selectedEntityId, onNodeClick, onNodeEdit, onNodeView, onConnect, highlightedConnectionIds,
  showPortLabels = false, showVlanLegend = true, connectable = true,
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
      onView: () => onNodeView?.(node.id),
    },
  }))

  const edges = (() => {
    const hasHighlight = highlightedConnectionIds && highlightedConnectionIds.size > 0
    return baseEdges.map((edge) => {
      const vlan  = vlanMap.get(edge.id) ?? 'default'
      const color = vlanColor(vlan)
      if (!hasHighlight) {
        return { ...edge, animated: showPortLabels, style: { stroke: color, strokeWidth: 2 } }
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

  const connectStartPos = React.useRef<{ x: number; y: number } | null>(null)
  const isDraggingConnection = React.useRef(false)

  const handleConnectStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const me = e as React.MouseEvent
    connectStartPos.current = { x: me.clientX, y: me.clientY }
    isDraggingConnection.current = false

    function onMouseMove(me: MouseEvent) {
      const start = connectStartPos.current
      if (!start) return
      const dx = me.clientX - start.x
      const dy = me.clientY - start.y
      if (Math.sqrt(dx * dx + dy * dy) >= 8) {
        isDraggingConnection.current = true
        window.removeEventListener('mousemove', onMouseMove)
      }
    }
    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleConnectEnd = useCallback(() => {
    isDraggingConnection.current = false
  }, [])

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (!isDraggingConnection.current) return
    onConnect?.(connection.source, connection.target)
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
      {showVlanLegend && <VlanLegend vlans={allVlans} />}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={connectable}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} color="#334155" gap={24} size={1.5} />
        <Controls className="!bg-gray-800 !border-gray-700 [&_button]:!bg-gray-700 [&_button]:!border-gray-600 [&_button]:!text-gray-300" />
        <FitViewShortcut />
      </ReactFlow>
    </div>
  )
}

function FitViewShortcut() {
  const { fitView } = useReactFlow()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'f' && e.key !== 'F') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      fitView({ padding: 0.2 })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fitView])

  return null
}
