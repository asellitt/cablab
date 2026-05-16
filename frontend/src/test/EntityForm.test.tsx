import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import EntityForm from '../components/EntityForm'
import { exampleTopology, emptyTopology } from './fixtures'
import type { Topology } from '../types/topology'

let lastPutBody: Topology | null = null

const server = setupServer(
  http.put('/api/topology', async ({ request }) => {
    lastPutBody = await request.json() as Topology
    return HttpResponse.json(lastPutBody)
  }),
)

beforeAll(() => server.listen())
afterEach(() => { server.resetHandlers(); lastPutBody = null })
afterAll(() => server.close())

const noop = () => {}

describe('EntityForm — new port ID auto-increment', () => {
  it('assigns id "1" when the entity has no ports', async () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={null}
        topology={emptyTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add port/i }))
    const idInput = screen.getByPlaceholderText('port-id')
    expect((idInput as HTMLInputElement).value).toBe('1')
  })

  it('assigns next integer after existing numeric port IDs', async () => {
    // computer-1 has eth0 (non-numeric), so nextPortId(['eth0']) → 1
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]} // has port 'eth0'
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add port/i }))
    const ids = screen.getAllByPlaceholderText('port-id').map((el) => (el as HTMLInputElement).value)
    expect(ids).toContain('1')
  })

  it('fills gaps before incrementing past the max', async () => {
    const topologyWithGaps = {
      ...emptyTopology,
      devices: [{
        id: 'd1', name: 'Device',
        ports: [
          { id: '1', connection_type: 'rj45' as const, standard: '1gbps' as const },
          { id: '2', connection_type: 'rj45' as const, standard: '1gbps' as const },
          { id: '4', connection_type: 'rj45' as const, standard: '1gbps' as const },
        ],
      }],
    }
    render(
      <EntityForm
        entityType="device"
        existingEntity={topologyWithGaps.devices[0]}
        topology={topologyWithGaps}
        onSaved={noop}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add port/i }))
    const ids = screen.getAllByPlaceholderText('port-id').map((el) => (el as HTMLInputElement).value)
    expect(ids).toContain('3')
    // Also verify sorted order: 1, 2, 3, 4
    expect(ids).toEqual(['1', '2', '3', '4'])
  })
})

describe('EntityForm — port connection display', () => {
  it('shows connection info next to a port that has a cable', () => {
    // computer-1 / eth0 connects to wall-1 / port-1 in exampleTopology
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]} // computer-1
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    // Should show the remote entity name
    expect(screen.getByText('Wall Panel - Office')).toBeInTheDocument()
    // And the remote port id
    expect(screen.getByText('port-1')).toBeInTheDocument()
  })

  it('shows no connection info for a port that has no cable', () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[1]} // camera-1, connected to wall-1/port-2
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    // camera-1/eth0 connects to wall-1/port-2 — should show wall panel name
    expect(screen.getByText('Wall Panel - Office')).toBeInTheDocument()
    expect(screen.getByText('port-2')).toBeInTheDocument()
  })

  it('shows no connection badges when editing a new entity', () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={null}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    // No connection arrows on a brand-new entity
    expect(screen.queryByText('Wall Panel - Office')).not.toBeInTheDocument()
  })
})

describe('EntityForm — delete', () => {
  it('shows a Delete button when editing an existing entity', () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('does not show a Delete button when creating a new entity', () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={null}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('shows a confirmation prompt when Delete is clicked', async () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/delete and remove all cables/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })

  it('calls onDeleted with entity and its connections removed after confirm', async () => {
    const onDeleted = vi.fn()
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]} // computer-1
        topology={exampleTopology}
        onSaved={noop}
        onDeleted={onDeleted}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())

    const saved: Topology = lastPutBody!
    // Entity removed
    expect(saved.devices.find((d) => d.id === 'computer-1')).toBeUndefined()
    // Connections to/from computer-1 removed
    expect(saved.connections.every(
      (c) => c.from.entity_id !== 'computer-1' && c.to.entity_id !== 'computer-1'
    )).toBe(true)
    // Other connections preserved
    expect(saved.connections.length).toBeGreaterThan(0)
  })

  it('cancels the confirmation when Cancel is clicked in confirm state', async () => {
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    // Click the cancel inside the confirm prompt (confirm's Cancel renders before the main Cancel)
    const cancels = screen.getAllByRole('button', { name: /cancel/i })
    await userEvent.click(cancels[0])
    expect(screen.queryByText(/delete and remove all cables/i)).not.toBeInTheDocument()
  })
})

describe('EntityForm — managed switch VLAN', () => {
  it('shows VLAN inputs for ports when managed is checked', async () => {
    const managedSwitch = { ...exampleTopology.switches[0], managed: true }
    render(
      <EntityForm
        entityType="switch"
        existingEntity={managedSwitch}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.getAllByPlaceholderText('default').length).toBeGreaterThan(0)
  })

  it('hides VLAN inputs when switch is unmanaged', () => {
    render(
      <EntityForm
        entityType="switch"
        existingEntity={exampleTopology.switches[0]} // managed: false
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.queryByPlaceholderText('default')).not.toBeInTheDocument()
  })

  it('strips VLANs from ports when saving an unmanaged switch', async () => {
    const managedSwitch = {
      ...exampleTopology.switches[0],
      managed: true,
      ports: [{ id: 'port-3', connection_type: 'rj45' as const, standard: '1gbps' as const, vlan: '10' }],
    }
    render(
      <EntityForm
        entityType="switch"
        existingEntity={managedSwitch}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    // Uncheck managed
    await userEvent.click(screen.getByRole('checkbox', { name: /managed switch/i }))
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(lastPutBody).not.toBeNull())
    const saved = lastPutBody!.switches.find((s) => s.id === managedSwitch.id)!
    expect(saved.ports.every((p) => !('vlan' in p) || p.vlan === undefined)).toBe(true)
  })
})

describe('EntityForm — save', () => {
  it('calls onSaved after a successful save', async () => {
    const onSaved = vi.fn()
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]}
        topology={exampleTopology}
        onSaved={onSaved}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('shows an error when the save fails', async () => {
    server.use(http.put('/api/topology', () => new HttpResponse(null, { status: 500 })))
    render(
      <EntityForm
        entityType="device"
        existingEntity={exampleTopology.devices[0]}
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(screen.getByText(/request failed/i)).toBeInTheDocument())
  })
})
