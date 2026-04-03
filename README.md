# Lidox Platform

Lidox is a real-time collaborative document editing platform with an integrated AI writing assistant, built for Assignment 1 of AI1220.

## 🏗️ Architecture Overview

This project is a Turborepo-managed monorepo consisting of:
- **Frontend (`apps/web`)**: React + TipTap (ProseMirror) rich-text editor.
- **Backend API (`apps/api`)**: NestJS REST API for document CRUD and AI orchestration.
- **Sync Server (`apps/sync-server`)**: WebSocket server using Hocuspocus and Yjs for CRDT-based real-time collaboration.
- **Shared Types (`packages/types`)**: Zod schemas and TypeScript interfaces shared across apps.

*Infrastructure requires PostgreSQL (durable storage) and Redis (ephemeral state, job queues, Pub/Sub).*

## 🚀 Getting Started

### Prerequisites
- Node.js (v20+)
- Docker & Docker Compose (for local databases)

### 1. Infrastructure Setup
Start the local PostgreSQL and Redis instances:
\`\`\`bash
docker-compose up -d
\`\`\`

### 2. Environment Variables
Copy the example environment file:
\`\`\`bash
cp .env.example .env
\`\`\`
*(Add your LLM provider API keys to the `.env` file if testing AI features).*

### 3. Install & Run
Install dependencies from the repository root:
\`\`\`bash
npm install
\`\`\`

Start all services in development mode via Turborepo:
\`\`\`bash
npx turbo run dev
\`\`\`

## 🛠️ Development Workflow
- **Linting & Formatting:** We use [Biome](https://biomejs.dev/). Run `npx @biomejs/biome check --apply .`
- **Commits:** Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.
- **Branching:** Use `feat/short-desc` or `fix/short-desc`. PRs require 1 approval and passing CI.