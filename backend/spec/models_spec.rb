# frozen_string_literal: true

require 'spec_helper'
require 'models'

RSpec.describe Port do
  describe '.from_h' do
    it 'parses required fields' do
      port = Port.from_h('id' => 'eth0', 'connection_type' => 'rj45', 'standard' => '1gbps')
      expect(port.id).to eq('eth0')
      expect(port.connection_type).to eq('rj45')
      expect(port.standard).to eq('1gbps')
      expect(port.label).to be_nil
    end

    it 'applies defaults when connection_type and speed are absent' do
      port = Port.from_h('id' => 'eth0')
      expect(port.connection_type).to eq(ConnectionType::RJ45)
      expect(port.standard).to eq(PortStandard::GBPS_1)
    end

    it 'parses an optional label' do
      port = Port.from_h('id' => 'eth0', 'label' => 'Uplink')
      expect(port.label).to eq('Uplink')
    end

    it 'raises when id is missing' do
      expect { Port.from_h({}) }.to raise_error(ArgumentError, /id/)
    end
  end

  describe '#to_h' do
    it 'round-trips without label' do
      h = { 'id' => 'eth0', 'connection_type' => 'sfp', 'standard' => '10gbps' }
      expect(Port.from_h(h).to_h).to eq(h)
    end

    it 'includes label when present' do
      port = Port.from_h('id' => 'eth0', 'label' => 'WAN')
      expect(port.to_h['label']).to eq('WAN')
    end

    it 'omits label key when nil' do
      port = Port.from_h('id' => 'eth0')
      expect(port.to_h).not_to have_key('label')
    end
  end
end

RSpec.describe Device do
  let(:raw) do
    {
      'id'    => 'computer-1',
      'name'  => 'Computer',
      'ports' => [{ 'id' => 'eth0', 'connection_type' => 'rj45', 'standard' => '1gbps' }],
    }
  end

  describe '.from_h' do
    it 'parses id, name, and ports' do
      device = Device.from_h(raw)
      expect(device.id).to eq('computer-1')
      expect(device.name).to eq('Computer')
      expect(device.ports.length).to eq(1)
      expect(device.ports.first).to be_a(Port)
    end

    it 'defaults ports to empty array' do
      device = Device.from_h('id' => 'd1', 'name' => 'Minimal')
      expect(device.ports).to eq([])
    end

    it 'raises when name is missing' do
      expect { Device.from_h('id' => 'd1') }.to raise_error(ArgumentError, /name/)
    end

    it 'parses location' do
      device = Device.from_h(raw.merge('location' => 'Office'))
      expect(device.location).to eq('Office')
    end

    it 'allows nil location' do
      device = Device.from_h(raw)
      expect(device.location).to be_nil
    end
  end

  describe '#to_h' do
    it 'round-trips correctly' do
      expect(Device.from_h(raw).to_h).to eq(raw)
    end

    it 'includes location when present' do
      expect(Device.from_h(raw.merge('location' => 'Office')).to_h['location']).to eq('Office')
    end

    it 'omits location key when nil' do
      expect(Device.from_h(raw).to_h).not_to have_key('location')
    end
  end
end

RSpec.describe Switch do
  let(:raw) do
    {
      'id'          => 'switch-1',
      'name'        => 'Main Switch',
      'managed'     => false,
      'uplink_port' => { 'id' => 'uplink', 'connection_type' => 'rj45', 'standard' => '1gbps' },
      'ports'       => [{ 'id' => 'port-1', 'connection_type' => 'rj45', 'standard' => '1gbps' }],
    }
  end

  describe '.from_h' do
    it 'parses all fields' do
      sw = Switch.from_h(raw)
      expect(sw.id).to eq('switch-1')
      expect(sw.managed).to be(false)
      expect(sw.uplink_port).to be_a(Port)
      expect(sw.ports.length).to eq(1)
    end

    it 'raises when uplink_port is missing' do
      expect { Switch.from_h('id' => 's1', 'name' => 'SW') }.to raise_error(ArgumentError, /uplink_port/)
    end

    it 'coerces managed from string "true"' do
      sw = Switch.from_h(raw.merge('managed' => 'true'))
      expect(sw.managed).to be(true)
    end
  end

  describe '#to_h' do
    it 'round-trips correctly' do
      expect(Switch.from_h(raw).to_h).to eq(raw)
    end

    it 'includes location when present' do
      expect(Switch.from_h(raw.merge('location' => 'Rack')).to_h['location']).to eq('Rack')
    end

    it 'omits location key when nil' do
      expect(Switch.from_h(raw).to_h).not_to have_key('location')
    end
  end
end

RSpec.describe Router do
  let(:raw) do
    {
      'id'       => 'router-1',
      'name'     => 'Router',
      'isp_port' => { 'id' => 'wan', 'connection_type' => 'rj45', 'standard' => '1gbps' },
      'ports'    => [],
    }
  end

  describe '.from_h' do
    it 'parses isp_port' do
      router = Router.from_h(raw)
      expect(router.isp_port).to be_a(Port)
      expect(router.isp_port.id).to eq('wan')
    end

    it 'raises when isp_port is missing' do
      expect { Router.from_h('id' => 'r1', 'name' => 'R') }.to raise_error(ArgumentError, /isp_port/)
    end
  end

  describe '#to_h' do
    it 'round-trips correctly' do
      expect(Router.from_h(raw).to_h).to eq(raw)
    end

    it 'includes location when present' do
      expect(Router.from_h(raw.merge('location' => 'Rack')).to_h['location']).to eq('Rack')
    end

    it 'omits location key when nil' do
      expect(Router.from_h(raw).to_h).not_to have_key('location')
    end
  end
end

RSpec.describe PatchPanel do
  let(:raw) do
    {
      'id'    => 'pp-1',
      'name'  => 'Patch Panel',
      'ports' => [{ 'id' => 'port-3', 'connection_type' => 'rj45', 'standard' => '1gbps' }],
    }
  end

  describe '#to_h / .from_h round-trip' do
    it 'preserves all fields' do
      expect(PatchPanel.from_h(raw).to_h).to eq(raw)
    end

    it 'includes location when present' do
      expect(PatchPanel.from_h(raw.merge('location' => 'Rack')).to_h['location']).to eq('Rack')
    end

    it 'omits location key when nil' do
      expect(PatchPanel.from_h(raw).to_h).not_to have_key('location')
    end
  end
end

RSpec.describe WallPanel do
  let(:raw) do
    {
      'id'       => 'wall-1',
      'name'     => 'Wall Panel - Office',
      'location' => 'Office',
      'ports'    => [{ 'id' => 'port-1', 'connection_type' => 'rj45', 'standard' => '1gbps' }],
    }
  end

  describe '.from_h' do
    it 'parses location' do
      wp = WallPanel.from_h(raw)
      expect(wp.location).to eq('Office')
    end

    it 'allows nil location' do
      wp = WallPanel.from_h(raw.reject { |k, _| k == 'location' })
      expect(wp.location).to be_nil
    end
  end

  describe '#to_h' do
    it 'round-trips with location' do
      expect(WallPanel.from_h(raw).to_h).to eq(raw)
    end

    it 'omits location key when nil' do
      wp = WallPanel.from_h(raw.reject { |k, _| k == 'location' })
      expect(wp.to_h).not_to have_key('location')
    end
  end
end

RSpec.describe Connection do
  let(:raw) do
    {
      'id'   => 'conn-1',
      'from' => { 'entity_id' => 'computer-1', 'port_id' => 'eth0' },
      'to'   => { 'entity_id' => 'wall-1',     'port_id' => 'port-1', 'side' => 'front' },
    }
  end

  describe '.from_h' do
    it 'parses from/to endpoints' do
      conn = Connection.from_h(raw)
      expect(conn.from_.entity_id).to eq('computer-1')
      expect(conn.to.entity_id).to eq('wall-1')
      expect(conn.to.side).to eq('front')
    end

    it 'accepts back as a valid side' do
      r = raw.deep_dup rescue raw.dup
      r['to'] = r['to'].merge('side' => 'back')
      conn = Connection.from_h(r)
      expect(conn.to.side).to eq('back')
    end

    it 'raises on an invalid side value' do
      r = raw.dup
      r['to'] = r['to'].merge('side' => 'rack')
      expect { Connection.from_h(r) }.to raise_error(ArgumentError, /Invalid side/)
    end

    it 'accepts the "from_" key as an alias' do
      aliased = raw.dup
      aliased['from_'] = aliased.delete('from')
      conn = Connection.from_h(aliased)
      expect(conn.from_.entity_id).to eq('computer-1')
    end

    it 'raises when from is missing' do
      expect { Connection.from_h(raw.reject { |k, _| k == 'from' }) }
        .to raise_error(ArgumentError, /from/)
    end

    it 'raises when to is missing' do
      expect { Connection.from_h(raw.reject { |k, _| k == 'to' }) }
        .to raise_error(ArgumentError, /to/)
    end
  end

  describe '#to_h' do
    it 'serialises "from_" back to "from"' do
      conn = Connection.from_h(raw)
      expect(conn.to_h).to have_key('from')
      expect(conn.to_h).not_to have_key('from_')
    end

    it 'round-trips correctly' do
      expect(Connection.from_h(raw).to_h).to eq(raw)
    end
  end
end

RSpec.describe Topology do
  let(:raw) do
    {
      'devices'      => [{ 'id' => 'd1', 'name' => 'PC', 'ports' => [] }],
      'switches'     => [],
      'routers'      => [],
      'patch_panels' => [],
      'wall_panels'  => [],
      'connections'  => [],
    }
  end

  describe '.from_h' do
    it 'parses devices' do
      topo = Topology.from_h(raw)
      expect(topo.devices.length).to eq(1)
      expect(topo.devices.first.name).to eq('PC')
    end

    it 'defaults all collections to empty arrays' do
      topo = Topology.from_h({})
      expect(topo.devices).to eq([])
      expect(topo.connections).to eq([])
    end
  end

  describe '#to_h' do
    it 'round-trips correctly' do
      expect(Topology.from_h(raw).to_h).to eq(raw)
    end
  end
end
