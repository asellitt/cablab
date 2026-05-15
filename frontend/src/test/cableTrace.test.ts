import { describe, it, expect } from 'vitest'
import { traceCableRun } from '../utils/cableTrace'
import { exampleTopology } from './fixtures'
import type { Topology } from '../types/topology'

// exampleTopology cable runs:
// computer-1/eth0 → wall-1/port-1 (conn-1)
//   wall-1/port-1 → pp-1/port-3   (conn-2)
//     pp-1/port-3 → switch-1/port-3 (conn-3)
//
// camera-1/eth0 → wall-1/port-2  (conn-4)
//   wall-1/port-2 → pp-1/port-4  (conn-5)
//     pp-1/port-4 → switch-1/port-4 (conn-6)
//
// router-1/lan-1 → switch-1/uplink (conn-7)

describe('traceCableRun', () => {
  it('follows a full run from device through wall panel and patch panel to switch', () => {
    const ids = traceCableRun(exampleTopology, 'computer-1')
    expect(ids.has('conn-1')).toBe(true)  // computer-1 → wall-1
    expect(ids.has('conn-2')).toBe(true)  // wall-1 → pp-1
    expect(ids.has('conn-3')).toBe(true)  // pp-1 → switch-1
  })

  it('does not bleed into a different port run on the same wall panel', () => {
    const ids = traceCableRun(exampleTopology, 'computer-1')
    expect(ids.has('conn-4')).toBe(false) // camera-1 → wall-1/port-2 — different port
    expect(ids.has('conn-5')).toBe(false)
    expect(ids.has('conn-6')).toBe(false)
  })

  it('traces camera-1 independently to the same switch via different ports', () => {
    const ids = traceCableRun(exampleTopology, 'camera-1')
    expect(ids.has('conn-4')).toBe(true)
    expect(ids.has('conn-5')).toBe(true)
    expect(ids.has('conn-6')).toBe(true)
    expect(ids.has('conn-1')).toBe(false)
  })

  it('traces a direct device-to-switch run with no passthroughs', () => {
    const ids = traceCableRun(exampleTopology, 'router-1')
    expect(ids.has('conn-7')).toBe(true)
    expect(ids.size).toBe(1)
  })

  it('returns an empty set for an entity with no connections', () => {
    const topology: Topology = {
      ...exampleTopology,
      devices: [{ id: 'lone', name: 'Lone Device', ports: [] }],
    }
    const ids = traceCableRun(topology, 'lone')
    expect(ids.size).toBe(0)
  })

  it('returns an empty set for an unknown entity id', () => {
    const ids = traceCableRun(exampleTopology, 'does-not-exist')
    expect(ids.size).toBe(0)
  })

  it('does not include the incoming cable on the patch panel when tracing from computer-1', () => {
    // conn-2: wall-1/port-1 (rack side) → pp-1/port-3 (back)  ← arrival
    // conn-3: pp-1/port-3 (front) → switch-1/port-3            ← exit
    // conn-5: wall-1/port-2 → pp-1/port-4                      ← unrelated
    // The OLD bug: pp-1/port-3 also matched conn-2 as a "candidate" going back
    // toward wall-1, which then bled into the bedroom→wall-1→pp-1 chain.
    const ids = traceCableRun(exampleTopology, 'computer-1')
    // Exactly three cables: computer→wall, wall→pp, pp→switch
    expect(ids).toEqual(new Set(['conn-1', 'conn-2', 'conn-3']))
  })
})
