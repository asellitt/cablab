import axios from 'axios'
import type { Topology } from '../types/topology'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export async function fetchTopology(): Promise<Topology> {
  const response = await api.get<Topology>('/topology')
  return response.data
}

export async function saveTopology(topology: Topology): Promise<Topology> {
  const response = await api.put<Topology>('/topology', topology)
  return response.data
}

export async function fetchTopologyYaml(): Promise<string> {
  const response = await api.get<string>('/topology/yaml', { responseType: 'text' })
  return response.data
}

export async function saveTopologyYaml(yaml: string): Promise<Topology> {
  const response = await api.put<Topology>('/topology/yaml', yaml, {
    headers: { 'Content-Type': 'text/plain' },
  })
  return response.data
}
