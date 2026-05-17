# Cablr

Homelab network topology visualiser. Define your devices, switches, routers, patch panels, and wall panels in a YAML file, then visualise and edit the cabling in a browser.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + React Flow |
| Backend | Ruby 3.3 + Sinatra 4 + Puma |
| Persistence | YAML file on disk |
| Proxy | nginx |
| Deployment | Docker Compose |

## Running

### Docker (recommended)

```
docker compose up --build
```

Open `http://localhost:3000`.

The topology is persisted to `./data/topology.yaml` on the host via a volume mount. The file is created automatically on first save if it doesn't exist.

### Using a pre-built image

Pre-built multi-arch images (linux/amd64 + linux/arm64) are published to Docker Hub. To use one, replace `build: .` in `docker-compose.yml` with:

```yaml
services:
  cablr:
    image: asellitt/cablr:latest
    ports:
      - "3000:80"
    volumes:
      - ./data:/data
```

Then `docker compose up` will pull the image without needing the source code.

### Local development

**Backend** — requires Ruby 3.x. Puma is in the `:server` group and requires native extensions, so exclude it locally:

```
cd backend
BUNDLE_WITHOUT=server bundle install
bundle exec ruby app.rb
```

The API runs on `http://localhost:4567` by default.

**Frontend**

```
cd frontend
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api/` to the backend.

## Testing

**Backend (RSpec)**

Puma requires native extensions that won't build locally without extra tooling. Always exclude the `:server` group — both when installing and when running tests. The `BUNDLE_WITHOUT` flag must be set on every `bundle` invocation because it is not persisted in the local bundler config.

```
cd backend
BUNDLE_WITHOUT=server bundle install
BUNDLE_WITHOUT=server bundle exec rspec spec/
```

**Frontend (Vitest)**

```
cd frontend
npm install   # first time only
npm test
```

API calls are intercepted by MSW so no backend is needed.

**Both**

```
# from repo root
(cd backend && BUNDLE_WITHOUT=server bundle exec rspec spec/) && (cd frontend && npm test)
```

## Topology YAML schema

The YAML file is the source of truth. It is read on every `GET /api/topology` and overwritten on every `PUT /api/topology`.

```yaml
devices:
  - id: string          # unique across all entities
    name: string
    ports:
      - id: string
        connection_type: rj45 | sfp | sfp+ | hdmi | usb-a | usb-c
        standard: 100mbps | 1gbps | 2.5gbps | 5gbps | 10gbps | 25gbps | sfp+ | hdmi-1.4 | hdmi-2.0 | hdmi-2.1 | usb2 | usb3 | usb3.2 | usb4
        label: string   # optional
        poe: true       # optional, defaults false

switches:
  - id: string
    name: string
    managed: bool       # defaults false
    uplink_port: <port> # required
    ports: [<port>]

routers:
  - id: string
    name: string
    isp_port: <port>    # required
    ports: [<port>]

patch_panels:
  - id: string
    name: string
    ports: [<port>]

wall_panels:
  - id: string
    name: string
    location: string    # optional
    ports: [<port>]

connections:
  - id: string
    from:
      entity_id: string
      port_id: string
      side: string      # optional — use for pass-through panels (room/rack, front/back)
    to:
      entity_id: string
      port_id: string
      side: string      # optional
    label: string       # optional
```

See `example.yaml` for a complete working example.

## Keyboard shortcuts

### Global (no dialog open)

| Shortcut | Action |
|---|---|
| `Alt / Opt + R` | New Router dialog |
| `Alt / Opt + S` | New Switch dialog |
| `Alt / Opt + W` | New Wall Panel dialog |
| `Alt / Opt + P` | New Patch Panel dialog |
| `Alt / Opt + D` | New Device dialog |

### Canvas (no dialog open)

| Shortcut | Action |
|---|---|
| `F` | Fit all entities in view |

### Entity selected (no dialog open)

| Shortcut | Action |
|---|---|
| `E` | Open edit dialog |
| `D` | Open delete confirm |
| `C` | Start new connection from this entity |
| `V` | Open port map |
| `Esc` | Deselect entity |

### Dialog open

| Shortcut | Action |
|---|---|
| `Enter` | Save (or confirm delete if the delete prompt is showing) |
| `Esc` | Close dialog |

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Returns `{"status":"ok"}` |
| `GET` | `/api/topology` | Returns the full topology as JSON |
| `PUT` | `/api/topology` | Replaces the topology; body is the same schema as the GET response |

All responses are `application/json`. Errors return `{"error":"..."}` with an appropriate status code (400 bad JSON, 422 validation failure, 500 server error).

## Releasing

```
./scripts/release.sh patch   # 1.2.3 → 1.2.4
./scripts/release.sh minor   # 1.2.3 → 1.3.0
./scripts/release.sh major   # 1.2.3 → 2.0.0
```

The script computes the next version from the latest git tag, asks for confirmation, builds and pushes a multi-arch image to Docker Hub (`asellitt/cablr:<version>` + `asellitt/cablr:latest`), then creates a local git tag. Run `git push origin <tag>` afterwards to publish the tag.

Requires `docker login` on first use.

## Docker details

- **Single container**: nginx (port 80) + Puma (port 8000) run under supervisord. nginx serves the static frontend and proxies `/api/` to Puma on localhost.
- **Build**: multi-stage — `node:20-alpine` builds the Vite bundle, `ruby:3.3-slim` installs gems and runs the final image.
- **Data volume**: `./data` on the host is mounted to `/data` in the container. Topology is read/written at `/data/topology.yaml`.
- The `backend/Gemfile.lock`, `frontend/node_modules`, and `frontend/.vite` are excluded from the Docker build context via `.dockerignore`.
