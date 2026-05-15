import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import ConnectionForm from '../components/ConnectionForm'
import { exampleTopology } from './fixtures'
import type { Topology, Connection } from '../types/topology'

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

describe('ConnectionForm — new connection', () => {
  it('shows the source entity name as locked', () => {
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.getAllByText('Computer').length).toBeGreaterThanOrEqual(1)
  })

  it('shows a dropdown of all entities for the To endpoint', () => {
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={exampleTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    // The To entity picker should list other entities
    expect(screen.getByRole('option', { name: 'Main Switch' })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={exampleTopology}
        onSaved={noop}
        onClose={onClose}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('saves a new connection and calls onSaved', async () => {
    const onSaved = vi.fn()
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={exampleTopology}
        onSaved={onSaved}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add cable/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const conn = lastPutBody!.connections.at(-1)!
    expect(conn.from.entity_id).toBe('computer-1')
    expect(conn.to.entity_id).toBeTruthy()
  })

  it('shows new-port fields when entity has no ports', () => {
    const noPortsTopology: Topology = {
      ...exampleTopology,
      devices: [{ id: 'computer-1', name: 'Computer', ports: [] }],
    }
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={noPortsTopology}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.getByPlaceholderText('e.g. eth0')).toBeInTheDocument()
  })

  it('creates the new port on the entity when saving with a new port', async () => {
    const noPortsTopology: Topology = {
      ...exampleTopology,
      devices: [{ id: 'computer-1', name: 'Computer', ports: [] }],
    }
    const onSaved = vi.fn()
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={noPortsTopology}
        onSaved={onSaved}
        onClose={noop}
      />
    )
    await userEvent.type(screen.getAllByPlaceholderText('e.g. eth0')[0], 'eth0')
    await userEvent.click(screen.getByRole('button', { name: /add cable/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const savedDevice = lastPutBody!.devices.find((d) => d.id === 'computer-1')!
    expect(savedDevice.ports).toHaveLength(1)
    expect(savedDevice.ports[0].id).toBe('eth0')
  })

  it('shows an error and does not close when port ID is empty', async () => {
    const noPortsTopology: Topology = {
      ...exampleTopology,
      devices: [{ id: 'computer-1', name: 'Computer', ports: [] }],
    }
    const onClose = vi.fn()
    render(
      <ConnectionForm
        sourceId="computer-1"
        topology={noPortsTopology}
        onSaved={noop}
        onClose={onClose}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add cable/i }))
    expect(screen.getByText(/both ports are required/i)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ConnectionForm — edit connection', () => {
  const existingConn: Connection = exampleTopology.connections[0] // computer-1/eth0 → wall-1/port-1

  it('shows "Edit Connection" heading when editing', () => {
    render(
      <ConnectionForm
        sourceId={existingConn.from.entity_id}
        topology={exampleTopology}
        existingConnection={existingConn}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText('Edit Connection')).toBeInTheDocument()
  })

  it('pre-fills from and to port IDs', () => {
    render(
      <ConnectionForm
        sourceId={existingConn.from.entity_id}
        topology={exampleTopology}
        existingConnection={existingConn}
        onSaved={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('port-1')).toBeInTheDocument()
  })

  it('replaces the connection on save rather than appending', async () => {
    const onSaved = vi.fn()
    render(
      <ConnectionForm
        sourceId={existingConn.from.entity_id}
        topology={exampleTopology}
        existingConnection={existingConn}
        onSaved={onSaved}
        onClose={noop}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    // Count should be same as before — not one more
    expect(lastPutBody!.connections).toHaveLength(exampleTopology.connections.length)
    // The id should be preserved
    const saved = lastPutBody!.connections.find((c) => c.id === existingConn.id)
    expect(saved).toBeTruthy()
  })
})
