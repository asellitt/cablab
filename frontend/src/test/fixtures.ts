import type { Topology } from '../types/topology'

export const emptyTopology: Topology = {
  devices: [],
  switches: [],
  routers: [],
  patch_panels: [],
  wall_panels: [],
  connections: [],
}

export const exampleTopology: Topology = {
  devices: [
    { id: 'computer-1', name: 'Computer', ports: [{ id: 'eth0', connection_type: 'rj45', standard: '1gbps' }] },
    { id: 'camera-1',   name: 'Camera',   ports: [{ id: 'eth0', connection_type: 'rj45', standard: '100mbps' }] },
  ],
  switches: [
    {
      id: 'switch-1',
      name: 'Main Switch',
      managed: false,
      uplink_port: { id: 'uplink', connection_type: 'rj45', standard: '1gbps' },
      ports: [
        { id: 'port-3', connection_type: 'rj45', standard: '1gbps' },
        { id: 'port-4', connection_type: 'rj45', standard: '1gbps' },
      ],
    },
  ],
  routers: [
    {
      id: 'router-1',
      name: 'Router',
      isp_port: { id: 'wan', connection_type: 'rj45', standard: '1gbps' },
      ports: [{ id: 'lan-1', connection_type: 'rj45', standard: '1gbps' }],
    },
  ],
  patch_panels: [
    {
      id: 'pp-1',
      name: 'Patch Panel',
      ports: [
        { id: 'port-3', connection_type: 'rj45', standard: '1gbps' },
        { id: 'port-4', connection_type: 'rj45', standard: '1gbps' },
      ],
    },
  ],
  wall_panels: [
    {
      id: 'wall-1',
      name: 'Wall Panel - Office',
      location: 'Office',
      ports: [
        { id: 'port-1', connection_type: 'rj45', standard: '1gbps' },
        { id: 'port-2', connection_type: 'rj45', standard: '1gbps' },
      ],
    },
  ],
  connections: [
    { id: 'conn-1', from: { entity_id: 'computer-1', port_id: 'eth0' },                   to: { entity_id: 'wall-1',   port_id: 'port-1', side: 'front' } },
    { id: 'conn-2', from: { entity_id: 'wall-1',     port_id: 'port-1', side: 'back'  }, to: { entity_id: 'pp-1',     port_id: 'port-3', side: 'back'  } },
    { id: 'conn-3', from: { entity_id: 'pp-1',       port_id: 'port-3', side: 'front' }, to: { entity_id: 'switch-1', port_id: 'port-3'               } },
    { id: 'conn-4', from: { entity_id: 'camera-1',   port_id: 'eth0'                  }, to: { entity_id: 'wall-1',   port_id: 'port-2', side: 'front' } },
    { id: 'conn-5', from: { entity_id: 'wall-1',     port_id: 'port-2', side: 'back'  }, to: { entity_id: 'pp-1',     port_id: 'port-4', side: 'back'  } },
    { id: 'conn-6', from: { entity_id: 'pp-1',       port_id: 'port-4', side: 'front' }, to: { entity_id: 'switch-1', port_id: 'port-4'               } },
    { id: 'conn-7', from: { entity_id: 'router-1',   port_id: 'lan-1'                 }, to: { entity_id: 'switch-1', port_id: 'uplink'               } },
  ],
}
