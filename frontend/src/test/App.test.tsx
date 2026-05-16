import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from '../App'
import { exampleTopology, emptyTopology } from './fixtures'

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

const server = setupServer(
  http.get('/api/topology', () => HttpResponse.json(exampleTopology)),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('App', () => {
  it('shows a loading state initially', () => {
    render(<App />)
    expect(screen.getByText(/loading topology/i)).toBeInTheDocument()
  })

  it('renders the sidebar and graph after loading', async () => {
    render(<App />)
    await waitFor(() => expect(screen.queryByText(/loading topology/i)).not.toBeInTheDocument())
    // Sidebar heading
    expect(screen.getByText('Cablr')).toBeInTheDocument()
    // Entity appears in sidebar (and possibly graph too)
    expect(screen.getAllByText('Computer').length).toBeGreaterThanOrEqual(1)
  })

  it('shows an error state when the API fails', async () => {
    server.use(http.get('/api/topology', () => new HttpResponse(null, { status: 500 })))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/failed to load topology/i)).toBeInTheDocument())
  })

  it('shows the empty topology gracefully', async () => {
    server.use(http.get('/api/topology', () => HttpResponse.json(emptyTopology)))
    render(<App />)
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(screen.getByText('0 cables')).toBeInTheDocument()
  })
})
