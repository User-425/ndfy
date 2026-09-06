# API Reference

This document describes all HTTP and WebSocket endpoints supported by `ndfy`.

---

## 1. Publishing Endpoints

### `POST /:topic` or `PUT /:topic`
Publishes a notification to the specified topic using plain text body and HTTP headers.

#### Headers
| Header | Aliases | Description |
| :--- | :--- | :--- |
| `Title` | `X-Title`, `t` | Message title |
| `Priority` | `X-Priority`, `p`, `Prio` | Priority (`1-5`, `min`, `low`, `default`, `high`, `max`, `urgent`) |
| `Tags` | `X-Tags`, `tag`, `ta` | Comma-separated tags or emojis |
| `Click` | `X-Click` | URL to open when notification is clicked |
| `Icon` | `X-Icon` | URL of an icon image |
| `Actions` | `X-Actions` | Action buttons (JSON string or ntfy action shorthand) |
| `Markdown` | `X-Markdown`, `md` | `yes` / `1` / `true` to render markdown |
| `Delay` | `X-Delay`, `X-Schedule` | Schedule delayed delivery (e.g. `10m`, `1h`, or Unix timestamp) |
| `Cache` | `X-Cache` | `no` or `false` to disable SQLite caching |
| `Authorization` | - | `Bearer <token>` if token authentication is enabled |

#### Request Body
Raw string payload of the message.

#### Response (`200 OK`)
```json
{
  "id": "1r9dKz3L2P1a",
  "time": 1700000000,
  "expires": 1700043200,
  "event": "message",
  "topic": "alerts",
  "message": "High CPU alert",
  "title": "Warning",
  "priority": 4,
  "tags": ["cpu", "warning"]
}
```

---

### `POST /` or `PUT /` (Root JSON Publishing)
Publishes a notification using a JSON payload.

#### Request Body
```json
{
  "topic": "alerts",
  "message": "High CPU load",
  "title": "Server Alert",
  "priority": 4,
  "tags": ["warning"],
  "click": "https://example.com/alerts",
  "delay": "10m"
}
```

#### Response (`200 OK`)
Returns the standard ntfy message JSON object.

---

## 2. Subscription Endpoints

### `GET /:topic/json`
Long-lived newline-delimited JSON (NDJSON) stream.

- Emits `{"event":"open","topic":"..."}\n` upon connection.
- Emits `{"event":"keepalive","topic":"..."}\n` every `KEEPALIVE_INTERVAL` seconds.
- Emits `{"event":"message", ...}\n` when new messages are published.

### `GET /:topic/sse`
Server-Sent Events stream (`Content-Type: text/event-stream`).

```
event: open
data: {"event":"open","topic":"alerts"}

event: keepalive
data: {"event":"keepalive","topic":"alerts"}

event: message
data: {"id":"...","event":"message","topic":"alerts","message":"Hello"}
```

### `GET /:topic/raw`
Raw message stream (`Content-Type: text/plain`). Emits plain text message bodies separated by newlines.

### `GET /:topic/ws`
WebSocket connection emitting JSON event objects.

---

## 3. Subscription Query Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `poll` | boolean (`1`, `yes`, `true`) | Return matching cached messages and close immediately |
| `since` | string / number | Retrieve messages from Unix timestamp (`1700000000`), duration (`10m`, `1h`), message ID (`1r9d...`), or `all` |
| `id` | string | Filter by exact message ID |
| `priority` | number (`1-5`) | Filter by minimum priority |
| `tags` | string | Comma-separated list of tags to filter by |

---

## 4. Health Endpoint

### `GET /health`
Returns server operational health.

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "uptime": 3600,
  "database": "connected",
  "subscribers": 4,
  "messages_count": 120
}
```
