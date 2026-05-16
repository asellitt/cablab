export type ConnectionType = 'rj45' | 'sfp' | 'sfp+' | 'hdmi' | 'usb-a' | 'usb-c'

export type PortStandard = '100mbps' | '1gbps' | '2.5gbps' | '5gbps' | '10gbps' | '25gbps' | 'sfp+' | 'hdmi-1.4' | 'hdmi-2.0' | 'hdmi-2.1' | 'usb2' | 'usb3' | 'usb3.2' | 'usb4'

export interface Port {
  id: string
  connection_type: ConnectionType
  standard: PortStandard
  label?: string
  poe?: boolean
  vlan?: string
}

export interface PassthroughPort {
  id: string
  label?: string
  connection_type: ConnectionType
  standard: PortStandard
}

export interface Device {
  id: string
  name: string
  location?: string
  ports: Port[]
}

export interface Switch {
  id: string
  name: string
  location?: string
  managed: boolean
  uplink_port: Port
  ports: Port[]
}

export interface Router {
  id: string
  name: string
  location?: string
  isp_port: Port
  ports: Port[]
}

export interface PatchPanel {
  id: string
  name: string
  location?: string
  ports: PassthroughPort[]
}

export interface WallPanel {
  id: string
  name: string
  location?: string
  ports: PassthroughPort[]
}

export type EndpointSide = 'front' | 'back'

export interface ConnectionEndpoint {
  entity_id: string
  port_id: string
  side?: EndpointSide
}

export interface Connection {
  id: string
  from: ConnectionEndpoint
  to: ConnectionEndpoint
}

export interface Topology {
  devices: Device[]
  switches: Switch[]
  routers: Router[]
  patch_panels: PatchPanel[]
  wall_panels: WallPanel[]
  connections: Connection[]
}

// Union of all editable entity types
export type EntityType = 'device' | 'switch' | 'router' | 'patch_panel' | 'wall_panel'

export type AnyEntity = Device | Switch | Router | PatchPanel | WallPanel

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  device: 'Device',
  switch: 'Switch',
  router: 'Router',
  patch_panel: 'Patch Panel',
  wall_panel: 'Wall Panel',
}

export const CONNECTION_TYPES: ConnectionType[] = ['rj45', 'sfp', 'sfp+', 'hdmi', 'usb-a', 'usb-c']
export const PORT_STANDARDS: PortStandard[] = ['100mbps', '1gbps', '2.5gbps', '5gbps', '10gbps', '25gbps', 'sfp+', 'hdmi-1.4', 'hdmi-2.0', 'hdmi-2.1', 'usb2', 'usb3', 'usb3.2', 'usb4']
