# Joyz-Style Dealership AI Platform

A full-stack multi-enterprise AI assistant platform tailored for automobile dealerships. The stack pairs a Vite + React + Tailwind frontend with Supabase (Postgres + pgvector + Edge Functions) and Zustand state management.

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm or npm
- Supabase CLI

### Install Dependencies
```bash
npm install
```

### Run Frontend
```bash
npm run dev
```

### Supabase Migrations
```bash
supabase migration up
```

### Edge Functions
```bash
supabase functions serve whatsapp-webhook
supabase functions serve ai-engine
supabase functions serve embed-article
supabase functions serve campaign-dispatch
```

### Configure OpenAI credentials for local Edge Functions
1. Create `supabase/functions/.env.local` and add your OpenAI key:
   ```bash
   OPENAI_API_KEY=sk-your-openai-key
   ```
2. When serving functions locally, load the env file:
   ```bash
   supabase functions serve ai-test --env-file supabase/functions/.env.local
   ```
3. Use the local anon key from `supabase/.env` when calling the function:
   ```bash
   curl -X POST http://127.0.0.1:54321/functions/v1/ai-test \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -d '{"ping": true}'
   ```

## Supabase 2Do Checklist
- [ ] Configure env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- [ ] Deploy migrations to your Supabase project.
- [ ] Set RLS policies for multi-tenant tables (`contacts`, `conversations`, etc.).
- [ ] Provide WhatsApp Cloud API credentials and OpenAI keys in Edge Function secrets.
- [ ] Schedule `campaign-dispatch` Edge Function using Supabase cron.

## Modules
- Real-time chat inbox with AI toggle.
- Knowledge base manager with embedding triggers.
- Bot personality configurator.
- Workflow engine with step builder and preview.
- Bulk campaign composer with CSV upload.

## Docs
- `docs/ai-context.md` — architecture and context.
- `docs/codex-logs.md` — running implementation log.

