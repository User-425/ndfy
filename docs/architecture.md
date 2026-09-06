# Architecture & System Design

`ndfy` is designed as a minimalist, high-performance, single-process notification server engineered to fulfill the core subset of the ntfy protocol with low memory and CPU footprint.

---

## High-Level Architecture Diagram

```
[Clients: cURL / SDK / Scripts]
             │
             │ HTTP POST/PUT /:topic, /
             ▼
┌────────────────────────────────────────────────────────────┐
│                    Fastify HTTP Server                     │
│  ├── Error Handler (ntfy JSON error formatting)           │
│  ├── Authentication (Bearer token, ?auth=)                │
│  └── In-Memory Rate Limiter (Sliding Window)               │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                      Message Service                       │
│  ├── Topic Validation & Normalization                      │
│  ├── ID & Time Generation                                  │
│  └── Ntfy Compatibility Layer (Headers/Priority/Actions)   │
└────────────┬───────────────────────────────┬───────────────┘
             │                               │
             ▼                               ▼
┌───────────────────────────┐   ┌────────────────────────────┐
│   SQLite Database (WAL)   │   │    In-Memory Broker        │
│   - messages table        │   │    Map<Topic, Set<Sub>>    │
│   - indices on topic/time │   └─────────────┬──────────────┘
│   - scheduled_at index    │                 │
│   - expires index         │                 │ Broadcast Event
└────────────▲──────────────┘                 ▼
             │                  ┌────────────────────────────┐
             │                  │    Streaming Transports    │
┌────────────┴──────────────┐   │    - NDJSON (/json)        │
│    Scheduler Service      │   │    - SSE (/sse)            │
│    - Due delayed dispatch │   │    - Raw Text (/raw)       │
│    - Expired message TTL  │   │    - WebSocket (/ws)       │
└───────────────────────────┘   └─────────────┬──────────────┘
                                              │
                                              ▼
                                 [Subscribers: Apps / Web]
```

---

## Module Responsibilities

1. **`src/api/`**:
   - Manages HTTP routes (`publish`, `subscribe`, `health`), middleware (`auth`, `rate-limit`), and Fastify server configuration.
   - Converts raw requests and streams responses.

2. **`src/compatibility/`**:
   - Encapsulates all ntfy wire protocols, header aliases (`Title`, `X-Title`, `Priority`, `Tags`, `Actions`), query parsing (`poll`, `since`), priority mappings (`1-5`, `urgent`, `low`), and standard error structures.
   - Prevents ntfy protocol quirks from leaking into internal business logic.

3. **`src/domain/`**:
   - Core domain orchestrator (`MessageService`) and authentication policies (`AuthService`).
   - Handles delayed scheduling, caching policies, and upstream dispatching.

4. **`src/realtime/`**:
   - `MessageBroker`: Unified in-memory pub-sub broker (`Map<string, Set<Subscriber>>`).
   - Stream transport adapters (`JsonStreamSubscriber`, `SseSubscriber`, `RawStreamSubscriber`, `WebSocketSubscriber`). All transports share the same broker.

5. **`src/storage/`**:
   - Embedded SQLite initialized with `WAL` (Write-Ahead Logging), `synchronous = NORMAL`, and `busy_timeout = 5000`.
   - `MessageRepository` provides indexed queries for historical message retrieval, delayed dispatching, and expired cleanup.

6. **`src/upstream/`**:
   - Implements ntfy upstream wake-up push requests.
   - Computes canonical topic URL `PUBLIC_BASE_URL + "/" + topic` and calculates SHA-256 hash.
   - Sends empty-body wake-up request with `X-Poll-ID: <message_id>` to `https://ntfy.sh/<sha256>`.

7. **`src/scheduler/`**:
   - Background polling for scheduled messages (`scheduled_at <= now()`) and expired message cleanup (`expires <= now()`).

8. **`src/security/`**:
   - Strict topic validation (regex `/^[a-zA-Z0-9_-]{1,64}$/`, path traversal, and null byte prevention).
   - In-memory rate limiting and SSRF protection.

---

## Concurrency & Performance

- **Zero External Dependencies**: Operates as a single Node.js process without requiring Docker, Redis, or PostgreSQL.
- **Embedded SQLite in WAL Mode**: Concurrently handles reads without blocking writes.
- **Memory Footprint**: Designed to maintain low idle memory (< 60MB) by utilizing lightweight in-memory data structures and automated TTL cache pruning.
