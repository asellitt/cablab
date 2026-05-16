# frozen_string_literal: true

module ConnectionType
  RJ45     = 'rj45'
  SFP      = 'sfp'
  SFP_PLUS = 'sfp+'
  HDMI     = 'hdmi'
  USB_A    = 'usb-a'
  USB_C    = 'usb-c'
  ALL      = [RJ45, SFP, SFP_PLUS, HDMI, USB_A, USB_C].freeze

  def self.valid?(v)
    ALL.include?(v)
  end
end

module PortStandard
  MBPS_100  = '100mbps'
  GBPS_1    = '1gbps'
  GBPS_2_5  = '2.5gbps'
  GBPS_5    = '5gbps'
  GBPS_10   = '10gbps'
  GBPS_25   = '25gbps'
  SFP_PLUS  = 'sfp+'
  HDMI_1_4  = 'hdmi-1.4'
  HDMI_2_0  = 'hdmi-2.0'
  HDMI_2_1  = 'hdmi-2.1'
  USB_2     = 'usb2'
  USB_3     = 'usb3'
  USB_3_2   = 'usb3.2'
  USB4      = 'usb4'
  ALL       = [MBPS_100, GBPS_1, GBPS_2_5, GBPS_5, GBPS_10, GBPS_25, SFP_PLUS, HDMI_1_4, HDMI_2_0, HDMI_2_1, USB_2, USB_3, USB_3_2, USB4].freeze

  def self.valid?(v)
    ALL.include?(v)
  end
end

def str!(hash, key)
  v = hash[key.to_s] || hash[key.to_sym]
  raise ArgumentError, "Missing required field: #{key}" if v.nil?
  v.to_s
end

def str_opt(hash, key)
  v = hash[key.to_s] || hash[key.to_sym]
  v&.to_s
end

def bool_field(hash, key, default: false)
  v = hash[key.to_s]
  v = hash[key.to_sym] if v.nil?
  return default if v.nil?
  v == true || v == 'true' || v == 1
end

class Port
  attr_accessor :id, :connection_type, :standard, :label, :poe

  def initialize(id:, connection_type: ConnectionType::RJ45, standard: PortStandard::GBPS_1, label: nil, poe: false)
    @id              = id
    @connection_type = connection_type
    @standard        = standard
    @label           = label
    @poe             = poe
  end

  def self.from_h(h)
    new(
      id:              str!(h, :id),
      connection_type: str_opt(h, :connection_type) || ConnectionType::RJ45,
      standard:        str_opt(h, :standard)        || PortStandard::GBPS_1,
      label:           str_opt(h, :label),
      poe:             bool_field(h, :poe, default: false)
    )
  end

  def to_h
    h = { 'id' => id, 'connection_type' => connection_type, 'standard' => standard }
    h['label'] = label unless label.nil?
    h['poe'] = true if poe
    h
  end
end

class PassthroughPort
  attr_accessor :id, :label, :connection_type, :standard

  def initialize(id:, label: nil, connection_type: ConnectionType::RJ45, standard: PortStandard::GBPS_1)
    @id              = id
    @label           = label
    @connection_type = connection_type
    @standard        = standard
  end

  def self.from_h(h)
    new(
      id:              str!(h, :id),
      label:           str_opt(h, :label),
      connection_type: str_opt(h, :connection_type) || ConnectionType::RJ45,
      standard:        str_opt(h, :standard)        || PortStandard::GBPS_1,
    )
  end

  def to_h
    h = { 'id' => id, 'connection_type' => connection_type, 'standard' => standard }
    h['label'] = label unless label.nil?
    h
  end
end

class Device
  attr_accessor :id, :name, :location, :ports

  def initialize(id:, name:, location: nil, ports: [])
    @id       = id
    @name     = name
    @location = location
    @ports    = ports
  end

  def self.from_h(h)
    new(
      id:       str!(h, :id),
      name:     str!(h, :name),
      location: str_opt(h, :location),
      ports:    (h['ports'] || h[:ports] || []).map { |p| Port.from_h(p) }
    )
  end

  def to_h
    h = { 'id' => id, 'name' => name, 'ports' => ports.map(&:to_h) }
    h['location'] = location unless location.nil?
    h
  end
end

class Switch
  attr_accessor :id, :name, :location, :managed, :uplink_port, :ports

  def initialize(id:, name:, location: nil, managed: false, uplink_port:, ports: [])
    @id          = id
    @name        = name
    @location    = location
    @managed     = managed
    @uplink_port = uplink_port
    @ports       = ports
  end

  def self.from_h(h)
    uplink_raw = h['uplink_port'] || h[:uplink_port]
    raise ArgumentError, 'Switch missing uplink_port' unless uplink_raw

    new(
      id:          str!(h, :id),
      name:        str!(h, :name),
      location:    str_opt(h, :location),
      managed:     bool_field(h, :managed, default: false),
      uplink_port: Port.from_h(uplink_raw),
      ports:       (h['ports'] || h[:ports] || []).map { |p| Port.from_h(p) }
    )
  end

  def to_h
    h = {
      'id'          => id,
      'name'        => name,
      'managed'     => managed,
      'uplink_port' => uplink_port.to_h,
      'ports'       => ports.map(&:to_h)
    }
    h['location'] = location unless location.nil?
    h
  end
end

class Router
  attr_accessor :id, :name, :location, :isp_port, :ports

  def initialize(id:, name:, location: nil, isp_port:, ports: [])
    @id       = id
    @name     = name
    @location = location
    @isp_port = isp_port
    @ports    = ports
  end

  def self.from_h(h)
    isp_raw = h['isp_port'] || h[:isp_port]
    raise ArgumentError, 'Router missing isp_port' unless isp_raw

    new(
      id:       str!(h, :id),
      name:     str!(h, :name),
      location: str_opt(h, :location),
      isp_port: Port.from_h(isp_raw),
      ports:    (h['ports'] || h[:ports] || []).map { |p| Port.from_h(p) }
    )
  end

  def to_h
    h = {
      'id'       => id,
      'name'     => name,
      'isp_port' => isp_port.to_h,
      'ports'    => ports.map(&:to_h)
    }
    h['location'] = location unless location.nil?
    h
  end
end

class PatchPanel
  attr_accessor :id, :name, :location, :ports

  def initialize(id:, name:, location: nil, ports: [])
    @id       = id
    @name     = name
    @location = location
    @ports    = ports
  end

  def self.from_h(h)
    new(
      id:       str!(h, :id),
      name:     str!(h, :name),
      location: str_opt(h, :location),
      ports:    (h['ports'] || h[:ports] || []).map { |p| PassthroughPort.from_h(p) }
    )
  end

  def to_h
    h = { 'id' => id, 'name' => name, 'ports' => ports.map(&:to_h) }
    h['location'] = location unless location.nil?
    h
  end
end

class WallPanel
  attr_accessor :id, :name, :location, :ports

  def initialize(id:, name:, location: nil, ports: [])
    @id       = id
    @name     = name
    @location = location
    @ports    = ports
  end

  def self.from_h(h)
    new(
      id:       str!(h, :id),
      name:     str!(h, :name),
      location: str_opt(h, :location),
      ports:    (h['ports'] || h[:ports] || []).map { |p| PassthroughPort.from_h(p) }
    )
  end

  def to_h
    h = { 'id' => id, 'name' => name, 'ports' => ports.map(&:to_h) }
    h['location'] = location unless location.nil?
    h
  end
end

ENDPOINT_SIDES = %w[front back].freeze

class ConnectionEndpoint
  attr_accessor :entity_id, :port_id, :side

  def initialize(entity_id:, port_id:, side: nil)
    @entity_id = entity_id
    @port_id   = port_id
    @side      = side
  end

  def self.from_h(h)
    side = str_opt(h, :side)
    if side && !ENDPOINT_SIDES.include?(side)
      raise ArgumentError, "Invalid side '#{side}': must be 'front' or 'back'"
    end
    new(
      entity_id: str!(h, :entity_id),
      port_id:   str!(h, :port_id),
      side:      side
    )
  end

  def to_h
    h = { 'entity_id' => entity_id, 'port_id' => port_id }
    h['side'] = side unless side.nil?
    h
  end
end

class Connection
  attr_accessor :id, :from_, :to

  def initialize(id:, from_:, to:)
    @id    = id
    @from_ = from_
    @to    = to
  end

  def self.from_h(h)
    from_raw = h['from'] || h[:from] || h['from_'] || h[:from_]
    to_raw   = h['to']   || h[:to]
    raise ArgumentError, 'Connection missing from endpoint' unless from_raw
    raise ArgumentError, 'Connection missing to endpoint'   unless to_raw

    new(
      id:    str!(h, :id),
      from_: ConnectionEndpoint.from_h(from_raw),
      to:    ConnectionEndpoint.from_h(to_raw),
    )
  end

  def to_h
    { 'id' => id, 'from' => from_.to_h, 'to' => to.to_h }
  end
end

class Topology
  attr_accessor :devices, :switches, :routers, :patch_panels, :wall_panels, :connections

  def initialize(
    devices: [], switches: [], routers: [],
    patch_panels: [], wall_panels: [], connections: []
  )
    @devices      = devices
    @switches     = switches
    @routers      = routers
    @patch_panels = patch_panels
    @wall_panels  = wall_panels
    @connections  = connections
  end

  def self.from_h(h)
    new(
      devices:      (h['devices']      || h[:devices]      || []).map { |x| Device.from_h(x) },
      switches:     (h['switches']     || h[:switches]     || []).map { |x| Switch.from_h(x) },
      routers:      (h['routers']      || h[:routers]      || []).map { |x| Router.from_h(x) },
      patch_panels: (h['patch_panels'] || h[:patch_panels] || []).map { |x| PatchPanel.from_h(x) },
      wall_panels:  (h['wall_panels']  || h[:wall_panels]  || []).map { |x| WallPanel.from_h(x) },
      connections:  (h['connections']  || h[:connections]  || []).map { |x| Connection.from_h(x) }
    )
  end

  def to_h
    {
      'devices'      => devices.map(&:to_h),
      'switches'     => switches.map(&:to_h),
      'routers'      => routers.map(&:to_h),
      'patch_panels' => patch_panels.map(&:to_h),
      'wall_panels'  => wall_panels.map(&:to_h),
      'connections'  => connections.map(&:to_h)
    }
  end
end
