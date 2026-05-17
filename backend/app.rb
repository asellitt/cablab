# frozen_string_literal: true

require 'sinatra/base'
require 'sinatra/json'
require 'json'
require 'rack/cors'
require_relative 'models'
require_relative 'yaml_store'

class CablabApp < Sinatra::Base
  use Rack::Cors do
    allow do
      origins '*'
      resource '*',
               headers: :any,
               methods: %i[get post put patch delete options head]
    end
  end

  set :show_exceptions, false
  set :raise_errors,    true
  set :data_file, '/data/topology.yaml'

  configure { mime_type :json, 'application/json' }

  def store
    YamlStore.new(settings.data_file)
  end

  def json_body
    request.body.rewind
    raw = request.body.read
    return {} if raw.nil? || raw.strip.empty?
    JSON.parse(raw)
  rescue JSON::ParserError => e
    halt 400, { 'Content-Type' => 'application/json' }, { error: "Invalid JSON: #{e.message}" }.to_json
  end

  get '/api/health' do
    content_type :json
    { status: 'ok' }.to_json
  end

  get '/api/topology' do
    content_type :json
    store.load.to_h.to_json
  rescue => e
    halt 500, { 'Content-Type' => 'application/json' }, { error: e.message }.to_json
  end

  get '/api/topology/yaml' do
    content_type 'text/plain; charset=utf-8'
    store.yaml
  rescue => e
    halt 500, { 'Content-Type' => 'application/json' }, { error: e.message }.to_json
  end

  put '/api/topology/yaml' do
    content_type :json
    request.body.rewind
    raw_yaml = request.body.read
    parsed = Psych.safe_load(raw_yaml, permitted_classes: [Symbol], symbolize_names: false)
    topology = Topology.from_h(parsed || {})
    store.save(topology).to_h.to_json
  rescue Psych::SyntaxError => e
    halt 400, { 'Content-Type' => 'application/json' }, { error: "YAML syntax error: #{e.message}" }.to_json
  rescue ArgumentError => e
    halt 422, { 'Content-Type' => 'application/json' }, { error: e.message }.to_json
  rescue => e
    halt 500, { 'Content-Type' => 'application/json' }, { error: "#{e.class}: #{e.message}" }.to_json
  end

  put '/api/topology' do
    content_type :json
    topology = Topology.from_h(json_body)
    store.save(topology).to_h.to_json
  rescue ArgumentError => e
    halt 422, { 'Content-Type' => 'application/json' }, { error: e.message }.to_json
  rescue => e
    halt 500, { 'Content-Type' => 'application/json' }, { error: "#{e.class}: #{e.message}" }.to_json
  end

  error(404) { content_type :json; { error: 'Not found' }.to_json }
  error(500) { content_type :json; { error: env['sinatra.error']&.message || 'Internal server error' }.to_json }
end
