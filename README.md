# Coy Discover
## About

Coy Discover is a privacy-first swipe app for discovering profiles.
It uses fictional mock profiles and a single seeded demo user.
No external authentication is required.

## Features

- Swipe profiles right to like or left to pass.
- Use drag gestures on mobile and buttons on desktop.
- Never show a profile again after it has been swiped.
- Create matches only when both users like each other.
- Show mutual matches in a dedicated view.
- Keep incoming likes private unless they become mutual.
- Persist swipes and matches in SQLite.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, Framer Motion
- Backend: Node.js and Express
- Database: SQLite with better-sqlite3

## Project Structure

```text
client/   React frontend and bundled profile avatars
server/   Express API, SQLite database, services, and seed data
```

## Requirements

- Node.js 20 or newer
- npm

## How to Run

From the project root:

```bash
npm install
npm run db:init
npm run seed
npm run dev
```

The app runs at `http://localhost:5173`.
The API runs at `http://localhost:3001`.
The server also seeds the database automatically when it starts.

## Testing

```bash
npm test -w client
npm test -w server
```

Main API endpoints:

- `GET /feed`
- `POST /swipe`
- `GET /matches`

The same endpoints are also available under `/api` for the frontend.

## Build

```bash
npm run build:client
```
