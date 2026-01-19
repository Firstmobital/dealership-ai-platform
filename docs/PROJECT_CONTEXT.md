# Techwheels AI — Project Context (Authoritative)

## 1. What This Project Is
A multi-tenant AI dealership platform (JoyzAI-style) built on Supabase + React.
Each dealership (organization) has its own data, AI behavior, and knowledge base.

## 2. Core Principles (Non-Negotiable)
- Strict multi-tenancy (organization_id everywhere)
- Service role bypasses RLS → code must enforce scope
- AI must NEVER hallucinate pricing, discounts, variants
- Knowledge Base responses are preferred over creativity
- If KB is missing → AI must admit uncertainty

## 3. Tech Stack
Frontend:
- React (Vite)
- Tailwind
- shadcn/ui
- Supabase client

Backend:
- Supabase (Postgres, Auth, Storage)
- Edge Functions (Deno)

AI:
- OpenAI (primary)
- Knowledge-base driven responses

## 4. Implemented Modules
- Conversations inbox
- Messages panel
- AI handler
- Knowledge base ingestion
- Campaign dispatch

## 5. Database Entities (Authoritative)
organizations
organization_users
users
contacts
conversations
messages
knowledge_articles
knowledge_chunks
unanswered_questions
bot_personality

## 6. AI Behavior Contract
- Use KB if available
- Never fabricate numbers
- Clearly state uncertainty
- Maintain conversation continuity

## 7. Known Pain Points
- KB retrieval failures
- Context loss
- Re-embedding flows
- Guardrail enforcement

## 8. Goal
A production-grade AI sales assistant for dealerships
that reduces human workload and never lies.
