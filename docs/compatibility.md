# ntfy Protocol Compatibility Matrix

This matrix details the subset of the ntfy server protocol implemented in `ndfy` V1.

---

## Compatibility Matrix

| Feature | Supported | Tested | Notes |
| :--- | :---: | :---: | :--- |
| **Plain POST Publishing (`POST /:topic`)** | ✅ Yes | ✅ Yes | Full body treated as message text |
| **Plain PUT Publishing (`PUT /:topic`)** | ✅ Yes | ✅ Yes | Compatible with PUT-based webhook senders |
| **Root JSON Publishing (`POST /`, `PUT /`)** | ✅ Yes | ✅ Yes | JSON body requires `topic` field |
| **Title Headers (`Title`, `X-Title`, `t`)** | ✅ Yes | ✅ Yes | Case-insensitive with aliases |
| **Priority Headers & Values (1-5, min-urgent)** | ✅ Yes | ✅ Yes | Normalized internally to 1-5 |
| **Tags Header (`Tags`, `X-Tags`, `tag`)** | ✅ Yes | ✅ Yes | Comma-separated parsing |
| **Click URL (`Click`, `X-Click`)** | ✅ Yes | ✅ Yes | Target URL when clicked |
| **Icon URL (`Icon`, `X-Icon`)** | ✅ Yes | ✅ Yes | Custom notification icon |
| **Action Buttons (`Actions`, `X-Actions`)** | ✅ Yes | ✅ Yes | Supports JSON array and ntfy shorthand (`view`, `http`, `broadcast`) |
| **Markdown Flag (`Markdown`, `X-Markdown`)** | ✅ Yes | ✅ Yes | Flag parsed and returned in message model |
| **Cache Control (`Cache: no`, `X-Cache: no`)** | ✅ Yes | ✅ Yes | Ephemeral messages skip SQLite persistence |
| **Delay / Schedule (`Delay`, `X-Delay`)** | ✅ Yes | ✅ Yes | Persisted with `scheduled_at`, dispatched periodically |
| **JSON Stream (`GET /:topic/json`)** | ✅ Yes | ✅ Yes | NDJSON format with `open` and `keepalive` |
| **SSE Stream (`GET /:topic/sse`)** | ✅ Yes | ✅ Yes | Standard Server-Sent Events |
| **Raw Stream (`GET /:topic/raw`)** | ✅ Yes | ✅ Yes | Plain text newline delimited |
| **WebSocket (`GET /:topic/ws`)** | ✅ Yes | ✅ Yes | Full WebSocket JSON stream support |
| **Polling Mode (`?poll=1`)** | ✅ Yes | ✅ Yes | Flushes cached messages and terminates |
| **Time/ID Filters (`?since=...`)** | ✅ Yes | ✅ Yes | Supports Unix timestamp, duration (`10m`, `1h`), message ID, and `all` |
| **SQLite Message Cache & Indexes** | ✅ Yes | ✅ Yes | SQLite with WAL mode & indexes on `(topic, time)`, `expires`, `scheduled_at` |
| **Expiration & Cleanup (`expires`)** | ✅ Yes | ✅ Yes | Configurable TTL & periodic cleanup |
| **Server Restart Recovery** | ✅ Yes | ✅ Yes | Messages survive server process restarts |
| **Bearer Authentication** | ✅ Yes | ✅ Yes | Configurable `AUTH_MODE=token` with Bearer headers or `?auth=` query |
| **Rate Limiting** | ✅ Yes | ✅ Yes | In-memory token bucket/sliding window for publish & subscribe |
| **Upstream Mobile Wake-up** | ✅ Yes | ✅ Yes | Canonical URL SHA-256 topic calculation and `X-Poll-ID` wake-up |
| **Health Check (`GET /health`)** | ✅ Yes | ✅ Yes | Reports uptime, database, subscriber count |
| **Topic Validation & Traversal Defense** | ✅ Yes | ✅ Yes | Rejects slashes, `..`, null bytes, control characters |
| **SSRF Guards** | ✅ Yes | ✅ Yes | Protects against private IPs and cloud metadata addresses |
| **Multiple-Topic Subscriptions (`/topic1,topic2/json`)** | ⚠️ Partial | ✅ Yes | Validated via `validateTopicList` |
| **Attachment File Uploads** | ❌ No | ❌ No | Out of scope for V1 (remote URLs supported) |
| **User Management & Web UI Dashboard** | ❌ No | ❌ No | Out of scope for V1 (protocol-first) |
| **Email Delivery / Phone Calls** | ❌ No | ❌ No | Out of scope for V1 |
| **Direct APNS / FCM Integration** | ❌ No | ❌ No | Handled via ntfy upstream wake-up |
