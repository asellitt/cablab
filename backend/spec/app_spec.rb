# frozen_string_literal: true

require 'spec_helper'
require 'rack/test'
require 'tmpdir'
require 'app'

RSpec.describe CablrApp do
  include Rack::Test::Methods

  let(:tmpdir)    { Dir.mktmpdir }
  let(:data_path) { File.join(tmpdir, 'topology.yaml') }

  def app
    CablrApp
  end

  before do
    # Point the app at a per-test temp file via environment variable
    ENV['DATA_FILE'] = data_path
    # Sinatra 4 enables host authorization by default; rack-test uses example.org
    header 'Host', 'localhost'
  end

  after do
    ENV.delete('DATA_FILE')
    FileUtils.rm_rf(tmpdir)
  end

  # ---------------------------------------------------------------------------
  # Health
  # ---------------------------------------------------------------------------

  describe 'GET /api/health' do
    it 'returns 200 with status ok' do
      get '/api/health'
      expect(last_response.status).to eq(200)
      body = JSON.parse(last_response.body)
      expect(body['status']).to eq('ok')
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/topology
  # ---------------------------------------------------------------------------

  describe 'GET /api/topology' do
    it 'returns 200 with an empty topology when no file exists' do
      get '/api/topology'
      expect(last_response.status).to eq(200)
      body = JSON.parse(last_response.body)
      expect(body['devices']).to eq([])
      expect(body['connections']).to eq([])
    end

    it 'returns the topology from disk' do
      File.write(data_path, <<~YAML)
        devices:
          - id: srv-1
            name: Server
            ports: []
        switches: []
        routers: []
        patch_panels: []
        wall_panels: []
        connections: []
      YAML

      get '/api/topology'
      expect(last_response.status).to eq(200)
      body = JSON.parse(last_response.body)
      expect(body['devices'].length).to eq(1)
      expect(body['devices'].first['name']).to eq('Server')
    end

    it 'sets Content-Type to application/json' do
      get '/api/topology'
      expect(last_response.content_type).to include('application/json')
    end
  end

  # ---------------------------------------------------------------------------
  # PUT /api/topology
  # ---------------------------------------------------------------------------

  describe 'PUT /api/topology' do
    let(:valid_payload) do
      {
        devices: [{ id: 'pc-1', name: 'PC', ports: [] }],
        switches: [],
        routers: [],
        patch_panels: [],
        wall_panels: [],
        connections: [],
      }.to_json
    end

    it 'returns 200 and persists the topology' do
      put '/api/topology', valid_payload, 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(200)

      body = JSON.parse(last_response.body)
      expect(body['devices'].first['name']).to eq('PC')
    end

    it 'writes the data so a subsequent GET returns it' do
      put '/api/topology', valid_payload, 'CONTENT_TYPE' => 'application/json'

      get '/api/topology'
      body = JSON.parse(last_response.body)
      expect(body['devices'].first['id']).to eq('pc-1')
    end

    it 'returns 400 on malformed JSON' do
      put '/api/topology', 'not json', 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(400)
    end

    it 'returns 422 when a required field is missing (switch without uplink_port)' do
      bad_payload = {
        devices: [],
        switches: [{ id: 'sw-1', name: 'SW' }],
        routers: [],
        patch_panels: [],
        wall_panels: [],
        connections: [],
      }.to_json
      put '/api/topology', bad_payload, 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(422)
    end

    it 'stores connections using "from" key in the YAML file' do
      payload = {
        devices: [],
        switches: [],
        routers: [],
        patch_panels: [],
        wall_panels: [],
        connections: [
          {
            id: 'c1',
            from: { entity_id: 'd1', port_id: 'eth0' },
            to:   { entity_id: 'd2', port_id: 'eth0' },
          },
        ],
      }.to_json

      put '/api/topology', payload, 'CONTENT_TYPE' => 'application/json'
      expect(last_response.status).to eq(200)

      raw_yaml = File.read(data_path)
      expect(raw_yaml).to include('from:')
      expect(raw_yaml).not_to include('from_:')
    end
  end

  # ---------------------------------------------------------------------------
  # GET /api/topology/yaml
  # ---------------------------------------------------------------------------

  describe 'GET /api/topology/yaml' do
    it 'returns text/plain content type' do
      get '/api/topology/yaml'
      expect(last_response.status).to eq(200)
      expect(last_response.content_type).to include('text/plain')
    end

    it 'returns an empty topology as YAML when no file exists' do
      get '/api/topology/yaml'
      body = last_response.body
      expect(body).to include('devices')
      expect(body).to include('connections')
    end

    it 'returns the raw YAML file contents when a file exists' do
      File.write(data_path, <<~YAML)
        devices:
          - id: srv-1
            name: Server
            ports: []
        switches: []
        routers: []
        patch_panels: []
        wall_panels: []
        connections: []
      YAML

      get '/api/topology/yaml'
      expect(last_response.status).to eq(200)
      expect(last_response.body).to include('srv-1')
    end
  end

  # ---------------------------------------------------------------------------
  # PUT /api/topology/yaml
  # ---------------------------------------------------------------------------

  describe 'PUT /api/topology/yaml' do
    let(:valid_yaml) do
      <<~YAML
        devices:
          - id: pc-1
            name: PC
            ports: []
        switches: []
        routers: []
        patch_panels: []
        wall_panels: []
        connections: []
      YAML
    end

    it 'returns 200 and the saved topology as JSON' do
      put '/api/topology/yaml', valid_yaml, 'CONTENT_TYPE' => 'text/plain'
      expect(last_response.status).to eq(200)
      body = JSON.parse(last_response.body)
      expect(body['devices'].first['name']).to eq('PC')
    end

    it 'persists the topology so a subsequent GET returns it' do
      put '/api/topology/yaml', valid_yaml, 'CONTENT_TYPE' => 'text/plain'

      get '/api/topology'
      body = JSON.parse(last_response.body)
      expect(body['devices'].first['id']).to eq('pc-1')
    end

    it 'returns 400 on invalid YAML syntax' do
      put '/api/topology/yaml', "devices: [\nbad: {yaml", 'CONTENT_TYPE' => 'text/plain'
      expect(last_response.status).to eq(400)
      body = JSON.parse(last_response.body)
      expect(body['error']).to match(/yaml syntax error/i)
    end

    it 'returns 422 when YAML is valid but model validation fails (switch missing uplink_port)' do
      bad_yaml = <<~YAML
        devices: []
        switches:
          - id: sw-1
            name: SW
        routers: []
        patch_panels: []
        wall_panels: []
        connections: []
      YAML
      put '/api/topology/yaml', bad_yaml, 'CONTENT_TYPE' => 'text/plain'
      expect(last_response.status).to eq(422)
      body = JSON.parse(last_response.body)
      expect(body['error']).to match(/uplink_port/i)
    end

    it 'does not persist the file when validation fails' do
      put '/api/topology/yaml', "devices: [\nbad yaml", 'CONTENT_TYPE' => 'text/plain'
      expect(File.exist?(data_path)).to be false
    end
  end
end
