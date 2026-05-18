# frozen_string_literal: true

$stdout.sync = true
$stderr.sync = true

require_relative 'app'

use Rack::CommonLogger

use(Class.new do
  def initialize(app) = @app = app
  def call(env)
    req = Rack::Request.new(env)
    $stderr.puts "[rack] #{req.request_method} #{req.url} | Origin: #{env['HTTP_ORIGIN'].inspect} | X-Forwarded-Proto: #{env['HTTP_X_FORWARDED_PROTO'].inspect} | Host: #{env['HTTP_HOST'].inspect}"
    status, headers, body = @app.call(env)
    $stderr.puts "[rack] -> #{status}"
    [status, headers, body]
  end
end)

run CablabApp
