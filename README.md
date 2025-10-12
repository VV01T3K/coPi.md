# copicat markdown

An [Astro](https://astro.build/) playground inspired by GitHub Gists. Create, edit, delete, and share Markdown snippets with persistence backed by Redis.

## Features

- Markdown workspace with a React-powered editor and live document list.
- REST-style JSON API under `/api/docs` for create, read, update, and delete operations.
- Redis storage using simple JSON payloads and sorted sets for ordering by last update.
- Shareable public pages at `/docs/:id` that render sanitized Markdown on the server.

## Getting Started

1. Install dependencies: `npm install`
2. Make sure a Redis instance is available and expose it via `REDIS_URL` (defaults to `redis://127.0.0.1:6379`).
3. Run the dev server: `npm run dev`
4. Open the listed URL in your browser to start creating notes.

## Available Scripts

| Command | Action |
| :-- | :-- |
| `npm run dev` | Start the Astro dev server with SSR enabled. |
| `npm run build` | Build the project for production (server output). |
| `npm run preview` | Preview the production build locally. |
| `npm run astro -- <cmd>` | Run arbitrary Astro CLI commands. |

## Environment

`REDIS_URL` – connection string to your Redis deployment. If omitted, the app falls back to `redis://127.0.0.1:6379`.
