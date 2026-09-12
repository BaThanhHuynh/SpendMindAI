# PRODUCTION ENGINEERING STANDARDS

## 1. Backend & Data Layer
- **Error Handling:** Centralized exception handlers. Standardized JSON error response: `{ "success": false, "error": { "code": "...", "message": "..." } }`.
- **Database & Query Performance:**
  - Zero N+1 query problems.
  - Strict indexing on foreign keys, unique fields, search filters, and graph/vector queries.
  - Connection pooling enabled, timeouts configured explicitly.
- **Security:**
  - Sanitized inputs (SQL/NoSQL/Cypher injection prevention).
  - CORS whitelisting, rate limiting on public endpoints.
  - No secret keys, tokens, or credentials in codebase (enforce `.env.production`).

## 2. Frontend & UI/UX
- **Visual & Component Polish:**
  - Unified spacing, typography, and color tokens (Tailwind / CSS Variables).
  - Explicit Loading, Empty, and Error states for every dynamic screen.
  - Zero layout shift (CLS), responsive breakpoints from 360px up to 4K.
- **Performance:**
  - Asset compression (WebP/AVIF for images, dynamic code splitting/lazy loading for routes).
  - Memoization of heavy computations and re-rendering guards.

## 3. Observability & Logging
- Structured logging (JSON format with request ID, timestamp, log level).
- Graceful shutdown handles for application processes.
- Health check endpoints (`/healthz`, `/readyz`).
