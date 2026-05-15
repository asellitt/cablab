# frozen_string_literal: true

require 'spec_helper'
require 'tmpdir'
require 'yaml_store'

RSpec.describe YamlStore do
  let(:tmpdir) { Dir.mktmpdir }
  let(:path)   { File.join(tmpdir, 'topology.yaml') }
  let(:store)  { YamlStore.new(path) }

  after { FileUtils.rm_rf(tmpdir) }

  describe '#load' do
    it 'returns an empty Topology when the file does not exist' do
      topo = store.load
      expect(topo).to be_a(Topology)
      expect(topo.devices).to eq([])
    end

    it 'returns an empty Topology for an empty file' do
      File.write(path, '')
      expect(store.load.devices).to eq([])
    end

    it 'parses a valid YAML file' do
      File.write(path, <<~YAML)
        devices:
          - id: computer-1
            name: Computer
            ports: []
        switches: []
        routers: []
        patch_panels: []
        wall_panels: []
        connections: []
      YAML

      topo = store.load
      expect(topo.devices.length).to eq(1)
      expect(topo.devices.first.name).to eq('Computer')
    end

    it 'parses connections with the "from" YAML key' do
      File.write(path, <<~YAML)
        devices: []
        switches: []
        routers: []
        patch_panels: []
        wall_panels: []
        connections:
          - id: conn-1
            from:
              entity_id: d1
              port_id: eth0
            to:
              entity_id: sw1
              port_id: port-1
      YAML

      topo = store.load
      expect(topo.connections.length).to eq(1)
      expect(topo.connections.first.from_.entity_id).to eq('d1')
    end
  end

  describe '#save' do
    it 'writes a topology to disk and reloads it correctly' do
      topo = Topology.new(
        devices: [Device.new(id: 'srv-1', name: 'Server', ports: [])],
        connections: []
      )

      store.save(topo)
      reloaded = store.load

      expect(reloaded.devices.length).to eq(1)
      expect(reloaded.devices.first.id).to eq('srv-1')
    end

    it 'uses "from" (not "from_") in the YAML output' do
      endpoint = ConnectionEndpoint.new(entity_id: 'd1', port_id: 'eth0')
      conn = Connection.new(
        id: 'c1',
        from_: endpoint,
        to: ConnectionEndpoint.new(entity_id: 'd2', port_id: 'eth0')
      )
      topo = Topology.new(connections: [conn])
      store.save(topo)

      raw_yaml = File.read(path)
      expect(raw_yaml).to include('from:')
      expect(raw_yaml).not_to include('from_:')
    end

    it 'creates parent directories if they do not exist' do
      nested_path = File.join(tmpdir, 'nested', 'deep', 'topology.yaml')
      nested_store = YamlStore.new(nested_path)
      nested_store.save(Topology.new)
      expect(File.exist?(nested_path)).to be(true)
    end

    it 'overwrites an existing file on successive saves' do
      topo1 = Topology.new(devices: [Device.new(id: 'd1', name: 'First', ports: [])])
      topo2 = Topology.new(devices: [Device.new(id: 'd2', name: 'Second', ports: [])])

      store.save(topo1)
      store.save(topo2)

      reloaded = store.load
      expect(reloaded.devices.length).to eq(1)
      expect(reloaded.devices.first.name).to eq('Second')
    end
  end
end
