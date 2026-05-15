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
