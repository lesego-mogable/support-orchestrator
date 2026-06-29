# Multi-Agent Customer Support Orchestrator

A production-ready customer support platform powered by a multi-agent AI pipeline. An LLM-based router classifies every incoming message and delegates to one of seven specialist agents, each backed by Semantic Kernel tool calling and real-time trace visibility in the dashboard.

---

## Architecture

```
Browser (Next.js 14)
    │
    │  REST / JSON
    ▼
Azure Functions v2 (Python)
    ├── POST /api/auth/signup
    ├── POST /api/auth/login
    ├── POST /api/sessions
    ├── GET  /api/sessions/{id}
    ├── POST /api/sessions/{id}/chat
    └── GET  /api/health
         │
         ▼
    Router Agent  ──────────────────────────────┐
    (intent classification via GPT)             │
         │                                      │
         ├── billing    → Billing Agent         │  Semantic Kernel
         ├── technical  → Tech Support Agent    │  FunctionChoiceBehavior.Auto()
         ├── order      → Order Status Agent    │  FUNCTION_INVOCATION filter
         ├── returns    → Returns Agent         │  (captures every tool call)
         ├── knowledge  → Knowledge Base Agent ─┼──► RAG Engine (FastAPI)
         ├── human      → Human Escalation      │       └── Azure AI Search
         └── general    → General Agent         │           (vector + BM25 hybrid)
                                                │
    Session State ◄─────────────────────────────┘
    (in-memory local / Azure Cosmos DB prod)
```

### Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, TypeScript |
| API | Azure Functions v2, Python 3.12 |
| AI orchestration | Semantic Kernel 1.30, Azure OpenAI (gpt-4.1-mini) |
| RAG | FastAPI, Azure AI Search (hybrid vector + BM25) |
| Embeddings | Azure OpenAI text-embedding-3-small |
| Session state | In-memory dict (local) / Azure Cosmos DB (production) |
| Auth | PyJWT (HS256), PBKDF2-SHA256 password hashing |
| Local storage emulator | Azurite |

---

## Repository layout

```
support-orchestrator/
├── api/                          # Azure Functions backend
│   ├── function_app.py           # All HTTP routes + auth logic
│   ├── host.json
│   ├── requirements.txt
│   ├── local.settings.json       # ← gitignored, contains secrets
│   ├── agents/
│   │   ├── base_agent.py         # Shared SK kernel + trace filter
│   │   ├── router_agent.py       # Intent classification + delegation
│   │   ├── billing_agent.py
│   │   ├── technical_agent.py
│   │   ├── order_agent.py
│   │   ├── returns_agent.py
│   │   ├── knowledge_agent.py    # Calls RAG engine via httpx
│   │   └── human_agent.py        # Creates escalation ticket
│   ├── plugins/
│   │   ├── billing_plugin.py     # SK @kernel_function tools
│   │   ├── technical_plugin.py
│   │   ├── order_plugin.py
│   │   └── returns_plugin.py
│   └── state/
│       └── cosmos_manager.py     # Session CRUD, in-memory for local dev
├── web/                          # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Auth guard → ChatWindow
│   │   └── login/page.tsx        # Signup / login page
│   ├── components/
│   │   └── ChatWindow.tsx        # Full dashboard UI + pipeline trace
│   └── lib/
│       ├── api.ts                # Typed fetch wrappers
│       └── mockFlows.ts          # Agent definitions and colour tokens
└── docker-compose.yml            # Azure Cosmos DB emulator
```

---

## Local development setup

### Prerequisites

- Node.js 20+ (via `.nvmrc` / nvm)
- Python 3.12
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- Docker Desktop (for the Cosmos emulator, optional)
- An Azure OpenAI resource with:
  - `gpt-4.1-mini` chat deployment
  - `text-embedding-3-small` embedding deployment (for RAG)

### 1. Clone and configure secrets

Create `api/local.settings.json` (never committed):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "python",
    "AZURE_OPENAI_ENDPOINT": "https://<your-resource>.openai.azure.com/",
    "AZURE_OPENAI_API_KEY": "<your-key>",
    "AZURE_OPENAI_CHAT_DEPLOYMENT": "gpt-4.1-mini",
    "COSMOS_DB_ENDPOINT": "https://localhost:8081",
    "COSMOS_DB_KEY": "<emulator-or-real-key>",
    "COSMOS_DB_DATABASE": "support_db",
    "COSMOS_DB_CONTAINER": "sessions",
    "JWT_SECRET": "<random-secret-min-32-chars>",
    "RAG_ENGINE_URL": "http://localhost:8000"
  }
}
```

> **Note:** When `COSMOS_DB_ENDPOINT` contains `localhost`, the API automatically uses an in-memory session store instead of Cosmos DB. This sidesteps the Python 3.12 / Cosmos emulator base64 incompatibility and requires no Docker setup for local dev.

### 2. Start Azurite (local Azure Storage)

Azure Functions requires a storage backend even locally.

```bash
npm install -g azurite
azurite --silent --location /tmp/azurite &
```

### 3. Start the API

```bash
cd api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
func start
```

Functions registered:

```
POST  http://localhost:7071/api/auth/signup
POST  http://localhost:7071/api/auth/login
POST  http://localhost:7071/api/sessions
GET   http://localhost:7071/api/sessions/{session_id}
POST  http://localhost:7071/api/sessions/{session_id}/chat
GET   http://localhost:7071/api/health
```

### 4. Start the frontend

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, then start chatting.

### 5. Start the RAG engine (optional — required for knowledge queries)

```bash
cd ../rag-engine
docker compose up -d ai-engine
```

The RAG engine exposes `POST /api/v1/query` on port 8000. The knowledge agent calls it automatically when intent is classified as `knowledge`. If it is not running, the agent returns a graceful fallback message.

---

## API reference

### Auth

```
POST /api/auth/signup
Body: { "name": "Jane Smith", "email": "jane@co.com", "password": "..." }
201:  { "token": "<jwt>", "user": { "id", "email", "name" } }

POST /api/auth/login
Body: { "email": "jane@co.com", "password": "..." }
200:  { "token": "<jwt>", "user": { "id", "email", "name" } }
```

Tokens are HS256 JWTs, valid for 24 hours. Store in `localStorage` and pass as `Authorization: Bearer <token>` for future protected endpoints.

### Sessions

```
POST /api/sessions
201: { "sessionId": "<uuid>" }

GET /api/sessions/{session_id}
200: { "sessionId", "messages": [ { "role", "content", "agent" } ] }
```

### Chat

```
POST /api/sessions/{session_id}/chat
Body: { "message": "Why is my bill higher this month?" }

200: {
  "answer":        "...",
  "agent":         "Billing Agent",
  "agentId":       "billing",
  "intentReason":  "User is asking about charges on their invoice.",
  "sessionId":     "<uuid>",
  "pipelineSteps": [ { "label": "...", "detail": "..." }, ... ],
  "agentTraces":   {
    "router":  [ { "fn": "Router.analyze_intent(...)", "result": "...", "ms": 312 } ],
    "billing": [ { "fn": "Billing.lookup_account(...)", "result": "...", "ms": 891 } ]
  },
  "totalMs": 2043
}
```

---

## Agents

| Agent | Intent | Semantic Kernel plugins | Description |
|---|---|---|---|
| Router | — | — | Classifies intent with a structured JSON prompt, routes to the specialist |
| Billing Agent | `billing` | `BillingPlugin` | Handles invoice lookups, payment history, overcharge disputes |
| Tech Support | `technical` | `TechnicalPlugin` | Diagnoses bugs, checks system status, guides configuration |
| Order Status | `order` | `OrderPlugin` | Looks up recent orders, shipment tracking, delivery ETAs |
| Returns Agent | `returns` | `ReturnsPlugin` | Checks eligibility, initiates returns, calculates refunds |
| Knowledge Base | `knowledge` | — | Calls the RAG engine for document-grounded answers |
| Human Escalation | `human` | — | Creates a support ticket and confirms escalation to a live agent |

All specialist agents share `base_agent.py`, which builds the Semantic Kernel kernel, registers a `FUNCTION_INVOCATION` filter that records every tool call (function name, result, latency), and returns the trace list alongside the answer.

---

## Frontend features

- **Auth flow** — signup / login page with inline validation; JWT stored in `localStorage`; root page redirects to `/login` if no token found
- **Pipeline trace panel** — live 6-step pipeline animation: Input → Router → Delegate → Tool Execution → Response → Delivered
- **Agent status map** — right-hand panel shows all 7 agents; active agent glows, tool calls expand on click
- **Optimistic animation** — router activates immediately on send; real agent traces replay once the API responds
- **New Chat** — creates a fresh backend session while staying on the page
- **User header** — avatar initial, display name, and logout button

---

## Environment variables

### `api/local.settings.json` (local dev only)

| Key | Description |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource URL |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | Chat model deployment name (`gpt-4.1-mini`) |
| `COSMOS_DB_ENDPOINT` | Cosmos DB endpoint (localhost = in-memory fallback) |
| `COSMOS_DB_KEY` | Cosmos DB master key |
| `COSMOS_DB_DATABASE` | Database name (default: `support_db`) |
| `COSMOS_DB_CONTAINER` | Container name (default: `sessions`) |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars in production) |
| `RAG_ENGINE_URL` | Base URL for the RAG engine (default: `http://localhost:8000`) |
| `AzureWebJobsStorage` | `UseDevelopmentStorage=true` for Azurite |

### `web/.env.local`

| Key | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Functions base URL (default: `http://localhost:7071/api`) |
| `NEXT_PUBLIC_RAG_ENGINE_URL` | RAG engine document upload URL (default: `http://localhost:3000/documents`) |

---

## Production deployment

1. **Frontend** → Azure Static Web Apps (`npm run build`, deploy the `out/` directory)
2. **API** → Azure Functions (consumption plan, Python 3.12 runtime)
3. **Sessions** → Azure Cosmos DB (set `COSMOS_DB_ENDPOINT` to the real endpoint; the in-memory fallback is disabled automatically)
4. **Secrets** → Azure Key Vault or Functions Application Settings (never commit `local.settings.json`)
5. **RAG engine** → Azure Container Apps or Azure App Service (deploy `rag-engine/ai-engine` Docker image)

---

## Known local dev notes

- **Cosmos emulator key** — The documented Cosmos emulator master key has 85 base64 characters, which Python 3.12's `binascii` rejects. The `cosmos_manager.py` detects `localhost` in the endpoint and uses an in-memory dict automatically. Real Azure Cosmos DB keys are valid base64 and work without issue.
- **Port conflicts** — Next.js falls back to port 3001 if 3000 is in use. The Functions host always runs on 7071.
- **RAG engine cold start** — The Docker build takes ~2 minutes on first run while pip installs dependencies into the container image.
