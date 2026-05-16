import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from '../components/Sidebar'
import { emptyTopology, exampleTopology } from './fixtures'

const noop = () => {}

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      topology={emptyTopology}
      selectedEntityId={null}
      onSelectEntity={noop}
      onAddEntity={noop}
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
    const row = screen.getByText('Computer').closest('button')!
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
