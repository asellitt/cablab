import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { fetchTopology, saveTopology, fetchTopologyYaml, saveTopologyYaml } from '../api/client'
import { emptyTopology, exampleTopology } from './fixtures'

const server = setupServer(
  http.get('/api/topology', () => HttpResponse.json(exampleTopology)),
  http.put('/api/topology', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(body)
  }),
  http.get('/api/topology/yaml', () => new HttpResponse('devices: []\n', { headers: { 'Content-Type': 'text/plain' } })),
  http.put('/api/topology/yaml', () => HttpResponse.json(emptyTopology)),
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('fetchTopology', () => {
  it('returns the topology from the API', async () => {
    const topo = await fetchTopology()
    expect(topo.devices).toHaveLength(2)
    expect(topo.devices[0].name).toBe('Computer')
  })

  it('throws on a non-2xx response', async () => {
    server.use(http.get('/api/topology', () => new HttpResponse(null, { status: 500 })))
    await expect(fetchTopology()).rejects.toThrow()
  })
})

describe('saveTopology', () => {
  it('sends the topology as JSON and returns the saved value', async () => {
    const saved = await saveTopology(emptyTopology)
    expect(saved.devices).toEqual([])
    expect(saved.connections).toEqual([])
  })

  it('throws on a non-2xx response', async () => {
    server.use(http.put('/api/topology', () => new HttpResponse(null, { status: 422 })))
    await expect(saveTopology(emptyTopology)).rejects.toThrow()
  })
})

describe('fetchTopologyYaml', () => {
  it('returns the YAML string from the API', async () => {
    const yaml = await fetchTopologyYaml()
    expect(yaml).toBe('devices: []\n')
  })

  it('throws on a non-2xx response', async () => {
    server.use(http.get('/api/topology/yaml', () => new HttpResponse(null, { status: 500 })))
    await expect(fetchTopologyYaml()).rejects.toThrow()
  })
})

describe('saveTopologyYaml', () => {
  it('sends YAML as text/plain and returns the saved topology', async () => {
    const saved = await saveTopologyYaml('devices: []\n')
    expect(saved.devices).toEqual([])
  })

  it('throws on a non-2xx response', async () => {
    server.use(http.put('/api/topology/yaml', () => new HttpResponse(null, { status: 400 })))
    await expect(saveTopologyYaml('invalid')).rejects.toThrow()
  })
})
