# coPi.md

An [Astro](https://astro.build/) playground inspired by GitHub Gists. Create, edit, delete, and share Markdown snippets with persistence backed by Redis.

## Features

- Markdown workspace with a React-powered editor and live document list.
- REST-style JSON API under `/api/docs` for create, read, update, and delete operations.
- Redis storage using simple JSON payloads and sorted sets for ordering by last update.
- Shareable public pages at `/docs/:id` that render sanitized Markdown on the server.
- Custom slugs for shareable links so you control the final URL.

## Getting Started

1. Install dependencies: `bun install`
2. Start a Redis instance (see "Local Redis" below) and expose it via `REDIS_URL` (defaults to `redis://127.0.0.1:6379`).
3. Run the dev server: `bun run dev`
4. Open the listed URL in your browser to start creating notes.

```bash
sudo apt-get update
sudo apt-get install -y redis-server
redis-server --save "" --appendonly no --daemonize yes
redis-cli ping
```

## Available Scripts

| Command | Action |
| :-- | :-- |
| `bun run dev` | Start the Astro dev server with SSR enabled. |
| `bun run build` | Build the project for production (server output). |
| `bun run preview` | Preview the production build locally. |
| `bun x astro <cmd>` | Run arbitrary Astro CLI commands. |

## Environment

`REDIS_URL` – connection string to your Redis deployment. If omitted, the app falls back to `redis://127.0.0.1:6379`.

This project uses the official `redis` client for Node.js with Bun. Older versions used `ioredis`; if you're upgrading, ensure you run:

```bash
bun remove ioredis
bun add redis@^4
```

## Local Redis

Run a local Redis instance with Docker Compose:

```bash
docker compose -f redis/compose.yaml up -d
```

Stop it when you are done:

```bash
docker compose -f redis/compose.yaml down
```

Once the container is running you can leave `REDIS_URL` unset or point it to `redis://127.0.0.1:6379`.
