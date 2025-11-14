# AI Context

This document outlines the dealership AI platform architecture, including frontend, backend edge functions, and database schema.

## Overview

The platform is built with React (Vite) + TailwindCSS on the frontend, Supabase for backend services, and pgvector for semantic search. Zustand provides client-side state management. Edge Functions handle AI orchestration, WhatsApp webhooks, embedding pipelines, and campaign dispatch.

## Frontend Modules

- **Global UI**: Multi-organization switcher, sidebar navigation, and layout scaffolding.
- **Chats**: Real-time conversation list, filters, message view, and composer with AI toggle.
- **Knowledge Base**: Article CRUD, chunk embedding triggers, unanswered questions triage.
- **Bot Personality**: Tone, language, response length, voice, and instruction editor.
- **Workflows**: Step builder with triggers, preview testing, and log visualization.
- **Campaigns**: Template selection, CSV upload, variable mapping, and analytics.

## State Management Stores

- `useAuthStore`: Auth session, user data, login/logout helpers.
- `useOrganizationStore`: Current organization context, list switching.
- `useChatStore`: Conversations, messages, filters, AI toggle actions.
- `useKnowledgeBaseStore`: Articles, unanswered questions, embedding status.
- `useWorkflowStore`: Workflows, steps, logs, and trigger configuration.
- `useCampaignStore`: Campaign queue, templates, upload status, metrics.

## Backend Edge Functions

- `whatsapp-webhook`: Receives incoming WhatsApp messages, persists them, and triggers AI responses.
- `ai-engine`: Core orchestrator that retrieves conversation context, personality, KB hits, workflows, and composes responses.
- `embed-article`: Chunks article content, generates embeddings, and stores them for retrieval.
- `campaign-dispatch`: Processes campaign queues, dispatches WhatsApp messages, and logs outcomes.

## Database Schema Summary

The schema includes organizations, users, contacts, conversations, messages, knowledge base articles and chunks, bot personality, workflows, and campaigns. The `knowledge_chunks` table leverages `vector(1536)` via pgvector for similarity search.

## Embeddings & Similarity

Embeddings use OpenAI-compatible providers and are stored in `knowledge_chunks.embedding`. Similarity search uses cosine distance with the `vector` extension.

## Multi-Tenancy

All major entities include an `organization_id` foreign key, enabling multi-enterprise separation. Policies should enforce organization isolation.

## Future Enhancements

- Web chat widget integration.
- Live typing indicators.
- Sales analytics dashboards.

