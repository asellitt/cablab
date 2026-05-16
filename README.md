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

### Local development

**Backend** — requires Ruby 3.x. Puma is in the `:server` group and requires native extensions, so exclude it locally:

```
cd backend
BUNDLE_WITHOUT=server bundle install
DATA_FILE=../data/topology.yaml bundle exec ruby app.rb
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

49 examples covering models, YAML serialisation, and all API endpoints.

**Frontend (Vitest)**

```
cd frontend
npm install   # first time only
npm test
```

19 tests covering the API client, Sidebar, TopologyGraph, and App components. API calls are intercepted by MSW so no backend is needed.

**Both**

```
# from repo root
(cd backend && BUNDLE_WITHOUT=server bundle exec rspec spec/) && (cd frontend && npm test)
```

## Project structure

```
.
├── backend/
│   ├── app.rb            # Sinatra routes
│   ├── models.rb         # Domain models (Device, Switch, Router, PatchPanel, WallPanel, Port, Connection, Topology)
│   ├── yaml_store.rb     # YAML read/write
│   ├── config.ru         # Rack entrypoint
│   ├── Gemfile
│   └── spec/
│       ├── app_spec.rb
│       ├── models_spec.rb
│       └── yaml_store_spec.rb
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/client.ts       # Axios wrapper
│   │   ├── components/
│   │   │   ├── TopologyGraph.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── EntityForm.tsx
│   │   ├── types/topology.ts   # Shared TypeScript types
│   │   └── test/
│   └── vite.config.ts
├── data/
│   └── topology.yaml     # Live topology (gitignore or commit your own)
├── example.yaml          # Reference topology to copy from
├── nginx.conf
├── Dockerfile.backend
├── Dockerfile.frontend
└── docker-compose.yml
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

## Docker details

- **Backend image**: `ruby:3.3-slim` with `build-essential` for native gem compilation (nio4r, puma). Puma binds to `0.0.0.0:8000`.
- **Frontend image**: multi-stage — `node:20-alpine` builds the Vite bundle, `nginx:alpine` serves it. nginx proxies `/api/` to the `backend` container by hostname.
- **Data volume**: `./data` on the host is mounted to `/data` in the backend container. The `DATA_FILE` env var tells the app where to read/write.
- The `backend/Gemfile.lock`, `frontend/node_modules`, and `frontend/.vite` are excluded from the Docker build context via `.dockerignore`.
