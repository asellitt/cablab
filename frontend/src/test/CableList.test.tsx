import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import CableList from '../components/CableList'
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

describe('CableList', () => {
  it('shows a count of cables in the heading', () => {
    render(<CableList topology={exampleTopology} onSaved={noop} onClose={noop} />)
    expect(screen.getByText(/\(7\)/)).toBeInTheDocument()
  })

  it('shows entity names and port IDs for each connection', () => {
    render(<CableList topology={exampleTopology} onSaved={noop} onClose={noop} />)
    // conn-1: computer-1/eth0 → wall-1/port-1
    expect(screen.getAllByText('Computer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('eth0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Wall Panel - Office').length).toBeGreaterThan(0)
  })

  it('shows a message when there are no cables', () => {
    render(<CableList topology={emptyTopology} onSaved={noop} onClose={noop} />)
    expect(screen.getByText(/no cables yet/i)).toBeInTheDocument()
  })

  it('calls onClose when Close button is clicked', async () => {
    const onClose = vi.fn()
    render(<CableList topology={exampleTopology} onSaved={noop} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(<CableList topology={exampleTopology} onSaved={noop} onClose={onClose} />)
    // The backdrop is the absolute-positioned div (first child of fixed wrapper)
    const backdrop = container.querySelector('.absolute.inset-0') as HTMLElement
    await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes a cable and calls onSaved with the updated topology', async () => {
    const onSaved = vi.fn()
    render(<CableList topology={exampleTopology} onSaved={onSaved} onClose={noop} />)

    const deleteButtons = screen.getAllByTitle('Delete cable')
    await userEvent.click(deleteButtons[0])

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    // One fewer connection than before
    expect(lastPutBody!.connections).toHaveLength(exampleTopology.connections.length - 1)
  })

  it('shows an error when delete fails', async () => {
    server.use(http.put('/api/topology', () => new HttpResponse(null, { status: 500 })))
    render(<CableList topology={exampleTopology} onSaved={noop} onClose={noop} />)
    const deleteButtons = screen.getAllByTitle('Delete cable')
    await userEvent.click(deleteButtons[0])
    await waitFor(() => expect(screen.getByText(/request failed/i)).toBeInTheDocument())
  })
})
