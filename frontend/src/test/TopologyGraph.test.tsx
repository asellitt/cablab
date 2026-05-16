import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TopologyGraph from '../components/TopologyGraph'
import { emptyTopology, exampleTopology } from './fixtures'

// ReactFlow relies on ResizeObserver which jsdom doesn't provide
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ELK runs a WASM worker which doesn't work in jsdom — stub it out with a
// synchronous layout that places every node at (0,0).
vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class {
    async layout(graph: { children: { id: string }[]; edges: unknown[] }) {
      return {
        children: (graph.children ?? []).map((n: { id: string; children?: { id: string }[] }) => ({
          ...n,
          x: 0,
          y: 0,
          children: (n.children ?? []).map((c) => ({ ...c, x: 0, y: 0 })),
        })),
        edges: graph.edges ?? [],
      }
    }
  },
}))

describe('TopologyGraph', () => {
  it('renders without crashing on an empty topology', async () => {
    const { container } = render(<TopologyGraph topology={emptyTopology} />)
    await waitFor(() => expect(screen.queryByText(/laying out/i)).not.toBeInTheDocument())
    expect(container.firstChild).toBeTruthy()
  })

  it('renders a node for each entity in the topology', async () => {
    render(<TopologyGraph topology={exampleTopology} />)
    await waitFor(() => expect(screen.queryByText(/laying out/i)).not.toBeInTheDocument())
    expect(screen.getByText('Computer')).toBeInTheDocument()
    expect(screen.getByText('Camera')).toBeInTheDocument()
    expect(screen.getByText('Main Switch')).toBeInTheDocument()
    expect(screen.getAllByText('Patch Panel').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Wall Panel - Office')).toBeInTheDocument()
    expect(screen.getAllByText('Router').length).toBeGreaterThanOrEqual(2)
  })

  it('renders type labels on each node', async () => {
    render(<TopologyGraph topology={exampleTopology} />)
    await waitFor(() => expect(screen.queryByText(/laying out/i)).not.toBeInTheDocument())
    expect(screen.getAllByText('Device').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Switch').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Router').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onNodeClick with the entity id when a node is clicked', async () => {
    const onNodeClick = vi.fn()
    render(<TopologyGraph topology={exampleTopology} onNodeClick={onNodeClick} />)
    await waitFor(() => expect(screen.queryByText(/laying out/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('Computer'))
    expect(onNodeClick).toHaveBeenCalledWith('computer-1')
  })
})
