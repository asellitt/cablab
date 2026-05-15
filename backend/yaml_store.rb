# frozen_string_literal: true

require 'psych'
require 'fileutils'
require_relative 'models'

class YamlStore
  def initialize(path = nil)
    @path = path || ENV.fetch('DATA_FILE', '/data/topology.yaml')
  end

  def load
    return Topology.new unless File.exist?(@path)

    raw = Psych.safe_load_file(@path, permitted_classes: [Symbol], symbolize_names: false)
    return Topology.new if raw.nil?

    Topology.from_h(raw)
  rescue => e
    raise "Failed to parse YAML file '#{@path}': #{e.message}"
  end

  def save(topology)
    FileUtils.mkdir_p(File.dirname(@path))
    File.write(@path, Psych.dump(topology.to_h))
    topology
  end

  def yaml
    return Psych.dump(Topology.new.to_h) unless File.exist?(@path)
    File.read(@path)
  end
end
