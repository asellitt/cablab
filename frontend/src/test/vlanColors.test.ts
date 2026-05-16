import { describe, it, expect } from 'vitest'
import { vlanColor, buildConnectionVlanMap, getAllVlans } from '../utils/vlanColors'
import type { Topology } from '../types/topology'

const base: Topology = {
  devices:      [{ id: 'd1', name: 'PC', ports: [{ id: 'eth0', connection_type: 'rj45', standard: '1gbps' }] }],
  switches:     [],
  routers:      [],
  patch_panels: [],
  wall_panels:  [],
  connections:  [],
}

describe('vlanColor', () => {
  it('returns blue for undefined', () => {
    expect(vlanColor(undefined)).toBe('#38bdf8')
  })
  it('returns blue for "default"', () => {
    expect(vlanColor('default')).toBe('#38bdf8')
  })
  it('returns blue for empty string', () => {
    expect(vlanColor('')).toBe('#38bdf8')
  })
  it('returns a different color for a named VLAN', () => {
    expect(vlanColor('10')).not.toBe('#38bdf8')
  })
  it('is stable — same VLAN always same color', () => {
    expect(vlanColor('20')).toBe(vlanColor('20'))
  })
  it('different VLANs can get different colors', () => {
    // With 9 non-default slots the odds of a collision across these three are low
    const colors = ['10', '20', '30'].map(vlanColor)
    const unique = new Set(colors)
    expect(unique.size).toBeGreaterThan(1)
  })
})

describe('buildConnectionVlanMap', () => {
  it('marks all connections as default when no managed switches', () => {
    const topo: Topology = {
      ...base,
      connections: [{ id: 'c1', from: { entity_id: 'd1', port_id: 'eth0' }, to: { entity_id: 'd1', port_id: 'eth0' } }],
    }
    const map = buildConnectionVlanMap(topo)
    expect(map.get('c1')).toBe('default')
  })

  it('assigns the VLAN from a managed switch port to a direct connection', () => {
    const topo: Topology = {
      ...base,
      switches: [{
        id: 'sw1', name: 'SW', managed: true,
        uplink_port: { id: 'uplink', connection_type: 'rj45', standard: '1gbps' },
        ports: [{ id: '1', connection_type: 'rj45', standard: '1gbps', vlan: '10' }],
      }],
      connections: [{ id: 'c1', from: { entity_id: 'sw1', port_id: '1' }, to: { entity_id: 'd1', port_id: 'eth0' } }],
    }
    const map = buildConnectionVlanMap(topo)
    expect(map.get('c1')).toBe('10')
  })

  it('propagates VLAN through a passthrough port', () => {
    const topo: Topology = {
      devices:  [{ id: 'd1', name: 'PC',    ports: [{ id: 'eth0', connection_type: 'rj45', standard: '1gbps' }] }],
      switches: [{
        id: 'sw1', name: 'SW', managed: true,
        uplink_port: { id: 'uplink', connection_type: 'rj45', standard: '1gbps' },
        ports: [{ id: '1', connection_type: 'rj45', standard: '1gbps', vlan: '20' }],
      }],
      routers:      [],
      patch_panels: [{ id: 'pp1', name: 'PP', ports: [{ id: '1', connection_type: 'rj45', standard: '1gbps' }] }],
      wall_panels:  [],
      connections: [
        { id: 'c1', from: { entity_id: 'sw1', port_id: '1'  }, to: { entity_id: 'pp1', port_id: '1', side: 'back'  } },
        { id: 'c2', from: { entity_id: 'pp1', port_id: '1', side: 'front' }, to: { entity_id: 'd1', port_id: 'eth0' } },
      ],
    }
    const map = buildConnectionVlanMap(topo)
    expect(map.get('c1')).toBe('20')
    expect(map.get('c2')).toBe('20')
  })

  it('assigns VLAN from a router port to a direct connection', () => {
    const topo: Topology = {
      devices:  [{ id: 'd1', name: 'PC', ports: [{ id: 'eth0', connection_type: 'rj45', standard: '1gbps' }] }],
      switches: [],
      routers:  [{
        id: 'r1', name: 'Router',
        isp_port: { id: 'wan', connection_type: 'rj45', standard: '1gbps' },
        ports: [{ id: 'lan1', connection_type: 'rj45', standard: '1gbps', vlan: '100' }],
      }],
      patch_panels: [],
      wall_panels:  [],
      connections: [{ id: 'c1', from: { entity_id: 'r1', port_id: 'lan1' }, to: { entity_id: 'd1', port_id: 'eth0' } }],
    }
    const map = buildConnectionVlanMap(topo)
    expect(map.get('c1')).toBe('100')
  })

  it('leaves default-VLAN port connections as default', () => {
    const topo: Topology = {
      ...base,
      switches: [{
        id: 'sw1', name: 'SW', managed: true,
        uplink_port: { id: 'uplink', connection_type: 'rj45', standard: '1gbps' },
        ports: [{ id: '1', connection_type: 'rj45', standard: '1gbps' }],
      }],
      connections: [{ id: 'c1', from: { entity_id: 'sw1', port_id: '1' }, to: { entity_id: 'd1', port_id: 'eth0' } }],
    }
    const map = buildConnectionVlanMap(topo)
    expect(map.get('c1')).toBe('default')
  })
})

describe('getAllVlans', () => {
  it('returns only ["default"] when no managed switches', () => {
    expect(getAllVlans(base)).toEqual(['default'])
  })

  it('returns default plus sorted VLANs from managed switch ports', () => {
    const topo: Topology = {
      ...base,
      switches: [{
        id: 'sw1', name: 'SW', managed: true,
        uplink_port: { id: 'uplink', connection_type: 'rj45', standard: '1gbps' },
        ports: [
          { id: '1', connection_type: 'rj45', standard: '1gbps', vlan: '30' },
          { id: '2', connection_type: 'rj45', standard: '1gbps', vlan: '10' },
        ],
      }],
    }
    expect(getAllVlans(topo)).toEqual(['default', '10', '30'])
  })

  it('includes VLANs from router ports', () => {
    const topo: Topology = {
      ...base,
      routers: [{
        id: 'r1', name: 'Router',
        isp_port: { id: 'wan', connection_type: 'rj45', standard: '1gbps' },
        ports: [{ id: 'lan1', connection_type: 'rj45', standard: '1gbps', vlan: '50' }],
      }],
    }
    expect(getAllVlans(topo)).toEqual(['default', '50'])
  })

  it('deduplicates the same VLAN across multiple ports', () => {
    const topo: Topology = {
      ...base,
      switches: [{
        id: 'sw1', name: 'SW', managed: true,
        uplink_port: { id: 'uplink', connection_type: 'rj45', standard: '1gbps' },
        ports: [
          { id: '1', connection_type: 'rj45', standard: '1gbps', vlan: '10' },
          { id: '2', connection_type: 'rj45', standard: '1gbps', vlan: '10' },
        ],
      }],
    }
    expect(getAllVlans(topo)).toEqual(['default', '10'])
  })
})
