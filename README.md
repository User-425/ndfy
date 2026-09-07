# ndfy
[ntfy](https://ntfy.sh), but in Node.js

Designed to be a drop-in replacement for the core subset of [ntfy](https://ntfy.sh). Existing client applications publishing to `https://ntfy.sh/my-topic` can migrate to `https://notify.example.com/my-topic` simply by updating their base URL. The official ntfy mobile application can subscribe and receive push notifications via upstream poll-request wake-up.

---

## Key Features

- **Protocol Compatibility**: Supports plain text `POST`/`PUT`, root JSON publishing, all standard ntfy headers (`Title`, `Priority`, `Tags`, `Click`, `Icon`, `Actions`, `Markdown`, `Delay`, `Cache`), and query parameters (`?poll=1`, `?since=`).
- **Unified Realtime Transports**:
  - `GET /:topic/json` (Newline-delimited JSON stream)
  - `GET /:topic/sse` (Server-Sent Events)
  - `GET /:topic/raw` (Raw text stream)
  - `GET /:topic/ws` (WebSocket)
- **Embedded SQLite Persistence**: Fast embedded SQLite cache with Write-Ahead Logging (`WAL`), supporting restart recovery and configurable TTL expiration.
- **Mobile Push Wake-up (Upstream integration)**: Integrates with official ntfy mobile push infrastructure using SHA-256 topic URL hashing and `X-Poll-ID` without leaking private notification contents upstream.
- **Ultra-lightweight Single Process**: Runs in a single Node.js process without requiring Redis, PostgreSQL, Kafka, or Docker. Low idle memory consumption.
- **Security First**: Topic name validation, path traversal prevention, SSRF protections, Bearer token authentication, and in-memory rate limiting.

---

## Quick Start

### 1. Requirements
- Node.js 22+ (tested on Node.js 22 and 24)
- npm or pnpm

### 2. Setup and Run
```bash
# Clone the repository
git clone https://github.com/example/ndfy.git
cd ndfy

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Build and start
npm run build
npm start
```

For development:
```bash
npm run dev
```

---

## Usage Examples

### 1. Publishing Notifications (Plain Text & Headers)
```bash
# Simple alert
curl -d "Server CPU load is 94%" http://localhost:8080/alerts

# With Title, Priority, Tags, and Click Action
curl \
  -H "Title: High CPU Alert" \
  -H "Priority: high" \
  -H "Tags: warning,computer" \
  -H "Click: https://grafana.example.com/d/server" \
  -d "Server CPU load is 94%" \
  http://localhost:8080/alerts
```

### 2. Publishing via JSON
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "alerts",
    "title": "Disk Warning",
    "message": "Free disk space below 10%",
    "priority": 4,
    "tags": ["warning", "floppy_disk"]
  }'
```

### 3. Subscribing to Events

#### JSON Stream (NDJSON)
```bash
curl -s http://localhost:8080/alerts/json
```

#### Server-Sent Events (SSE)
```bash
curl -s -N http://localhost:8080/alerts/sse
```

#### Raw Stream
```bash
curl -s http://localhost:8080/alerts/raw
```

#### Polling & Historical Messages
```bash
# Poll cached messages and exit immediately
curl -s "http://localhost:8080/alerts/json?poll=1"

# Query messages received in the last 10 minutes
curl -s "http://localhost:8080/alerts/json?since=10m"
```

---

## Documentation

- [Architecture & Design](docs/architecture.md)
- [API Reference](docs/api.md)
- [Compatibility Matrix](docs/compatibility.md)
- [Deployment Guide](docs/deployment.md)

---

## Running Tests

```bash
# Run Vitest test suite
npm test
```

---

## License

Apache-2.0
