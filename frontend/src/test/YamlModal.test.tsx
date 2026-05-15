import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import YamlModal from '../components/YamlModal'
import { emptyTopology } from './fixtures'

const YAML_CONTENT = 'devices: []\nconnections: []\n'

const server = setupServer(
  http.get('/api/topology/yaml', () =>
    new HttpResponse(YAML_CONTENT, { headers: { 'Content-Type': 'text/plain' } })
  ),
  http.put('/api/topology/yaml', () => HttpResponse.json(emptyTopology)),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('YamlModal', () => {
  it('loads and displays the YAML', async () => {
    render(<YamlModal onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(YAML_CONTENT))
  })

  it('shows a load error when the API fails', async () => {
    server.use(http.get('/api/topology/yaml', () => new HttpResponse(null, { status: 500 })))
    render(<YamlModal onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(screen.getByText(/request failed/i)).toBeInTheDocument())
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(<YamlModal onClose={onClose} onSaved={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument())
    await userEvent.click(container.querySelector('.absolute.inset-0')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onSaved with the topology and closes on successful save', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<YamlModal onClose={onClose} onSaved={onSaved} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(YAML_CONTENT))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(emptyTopology))
  })

  it('shows a save error inline without closing', async () => {
    server.use(
      http.put('/api/topology/yaml', () =>
        HttpResponse.json({ error: 'YAML syntax error: bad input' }, { status: 400 })
      )
    )
    const onClose = vi.fn()
    render(<YamlModal onClose={onClose} onSaved={() => {}} />)
    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/yaml syntax error/i)).toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
