import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import Sidebar from '../components/Sidebar'
import { emptyTopology, exampleTopology } from './fixtures'
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

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      topology={emptyTopology}
      selectedEntityId={null}
      onSelectEntity={noop}
      onEditEntity={noop}
      onAddEntity={noop}
      onTopologyChange={noop}
      onShowYaml={noop}
      onShowCables={noop}
      {...props}
    />
  )
}

describe('Sidebar', () => {
  it('renders section headings for all entity types', () => {
    renderSidebar()
    expect(screen.getByText('Routers')).toBeInTheDocument()
    expect(screen.getByText('Switches')).toBeInTheDocument()
    expect(screen.getByText('Patch Panels')).toBeInTheDocument()
    expect(screen.getByText('Wall Panels')).toBeInTheDocument()
    expect(screen.getByText('Devices')).toBeInTheDocument()
  })

  it('lists entity names from the topology', () => {
    renderSidebar({ topology: exampleTopology })
    expect(screen.getByText('Computer')).toBeInTheDocument()
    expect(screen.getByText('Camera')).toBeInTheDocument()
    expect(screen.getByText('Main Switch')).toBeInTheDocument()
    expect(screen.getByText('Router')).toBeInTheDocument()
    expect(screen.getByText('Patch Panel')).toBeInTheDocument()
    expect(screen.getByText('Wall Panel - Office')).toBeInTheDocument()
  })

  it('shows entity counts in section headers', () => {
    renderSidebar({ topology: exampleTopology })
    expect(screen.getByText('(2)')).toBeInTheDocument() // 2 devices
  })

  it('shows cable count in footer', () => {
    renderSidebar({ topology: exampleTopology })
    expect(screen.getByText(/7 cables/)).toBeInTheDocument()
  })

  it('calls onSelectEntity with the entity id when a row is clicked', async () => {
    const onSelect = vi.fn()
    renderSidebar({ topology: exampleTopology, onSelectEntity: onSelect })
    await userEvent.click(screen.getByText('Computer'))
    expect(onSelect).toHaveBeenCalledWith('computer-1')
  })

  it('calls onEditEntity when the pencil icon is clicked', async () => {
    const onEdit = vi.fn()
    renderSidebar({ topology: exampleTopology, onEditEntity: onEdit })
    const editBtn = screen.getByTitle('Edit Computer')
    await userEvent.click(editBtn)
    expect(onEdit).toHaveBeenCalledWith('computer-1')
  })

  it('does not call onEditEntity when the row body is clicked', async () => {
    const onEdit = vi.fn()
    const onSelect = vi.fn()
    renderSidebar({ topology: exampleTopology, onSelectEntity: onSelect, onEditEntity: onEdit })
    await userEvent.click(screen.getByText('Computer'))
    expect(onSelect).toHaveBeenCalledWith('computer-1')
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('shows a confirm prompt when the delete icon is clicked', async () => {
    renderSidebar({ topology: exampleTopology })
    await userEvent.click(screen.getByTitle('Delete Computer'))
    expect(screen.getByText(/delete and remove all cables/i)).toBeInTheDocument()
  })

  it('cancels delete when Cancel is clicked in the confirm prompt', async () => {
    renderSidebar({ topology: exampleTopology })
    await userEvent.click(screen.getByTitle('Delete Computer'))
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByText(/delete and remove all cables/i)).not.toBeInTheDocument()
  })

  it('deletes entity and its connections on confirm', async () => {
    const onTopologyChange = vi.fn()
    renderSidebar({ topology: exampleTopology, onTopologyChange })
    await userEvent.click(screen.getByTitle('Delete Computer'))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(onTopologyChange).toHaveBeenCalled())
    const saved: Topology = lastPutBody!
    expect(saved.devices.find((d) => d.id === 'computer-1')).toBeUndefined()
    expect(saved.connections.every(
      (c) => c.from.entity_id !== 'computer-1' && c.to.entity_id !== 'computer-1'
    )).toBe(true)
  })

  it('calls onAddEntity with the correct type when Add is clicked', async () => {
    const onAdd = vi.fn()
    const { container } = renderSidebar({ onAddEntity: onAdd })
    const devicesHeading = screen.getByText('Devices').closest('div')!
    await userEvent.hover(devicesHeading)
    const addBtn = container.querySelector('[title="Add device"]')!
    await userEvent.click(addBtn)
    expect(onAdd).toHaveBeenCalledWith('device')
  })

  it('collapses and hides entities when the section toggle is clicked', async () => {
    renderSidebar({ topology: exampleTopology })
    expect(screen.getByText('Computer')).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Collapse Devices'))
    expect(screen.queryByText('Computer')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Expand Devices'))
    expect(screen.getByText('Computer')).toBeInTheDocument()
  })

  it('lists entities sorted alphabetically within a section', () => {
    renderSidebar({ topology: exampleTopology })
    const deviceButtons = screen.getAllByRole('button').filter((b) =>
      b.textContent?.includes('camera-1') || b.textContent?.includes('computer-1')
    )
    const names = deviceButtons.map((b) => b.querySelector('span')?.textContent)
    expect(names[0]).toBe('Camera')
    expect(names[1]).toBe('Computer')
  })

  it('highlights the selected entity row', () => {
    renderSidebar({ topology: exampleTopology, selectedEntityId: 'computer-1' })
    const row = screen.getByText('Computer').closest('div')!
    expect(row.className).toMatch(/bg-gray-700/)
  })

  it('calls onShowYaml when the YAML button is clicked', async () => {
    const onShowYaml = vi.fn()
    renderSidebar({ onShowYaml })
    await userEvent.click(screen.getByTitle('View YAML'))
    expect(onShowYaml).toHaveBeenCalled()
  })

  it('calls onShowCables when the cables count is clicked', async () => {
    const onShowCables = vi.fn()
    renderSidebar({ topology: exampleTopology, onShowCables })
    await userEvent.click(screen.getByText(/7 cables/))
    expect(onShowCables).toHaveBeenCalled()
  })
})
