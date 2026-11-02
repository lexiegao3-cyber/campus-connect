# Campus Connect

A full-stack campus activity discovery and RSVP application.

**Status:** deployed portfolio MVP. The feature list below describes the current implementation; planned capabilities are listed separately.

## Features

- Browse fictional sample activities and user-created events.
- Search activity titles and filter by category.
- Create events with a location, coordinates, date/time, and description.
- Open activity locations in OpenStreetMap.
- Sign in with ChatGPT and maintain a personal RSVP list.
- Persist events and user-specific RSVPs using parameterized SQL and duplicate-safe writes.

## Technology stack

| Layer | Technology |
| --- | --- |
| User interface | React 19, TypeScript, CSS |
| Application framework | Vinext with Next.js-compatible app routes |
| Server runtime | Cloudflare Workers |
| Persistence | Cloudflare D1 / SQLite; Drizzle schema migrations |
| Identity | Sites-provided Sign in with ChatGPT |
| Development | Node.js 22.13 or later, npm, TypeScript |

Node.js is used for development and testing. The deployed server runs in Cloudflare Workers, not an Express server.

## Architecture

```text
React interface -> /api/data -> authenticated server handlers -> Cloudflare D1
```

The server derives user identity from trusted platform-provided authentication headers rather than a client-supplied user ID. Records use parameterized SQL. User-owned writes are scoped to the signed-in user.

## Run locally

Prerequisites: Node.js 22.13+ and npm.

```sh
git clone https://github.com/lexiegao3-cyber/campus-connect.git
cd campus-connect
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

Open the local URL printed by the development server, then use **Sign in with ChatGPT**. The portable development profile simulates a local test identity; it is not a production authentication system. The generated build configuration is required by the database migration command.

Local data is stored under the ignored `.wrangler/` directory. Do not commit databases, credentials, or local environment files.

## Verification

```sh
npm run typecheck
npm run build
```

Type checking and builds passed for the original MVP. Browser checks covered authenticated database-backed interactions. This is not a security audit or load-test certification.

## API

- `GET /api/data`: load application records for the current interface and identity.
- `POST /api/data`: submit a validated application action.

Handlers live in `app/api/data/route.ts`. Business logic, where separated, lives in `app/rank.mjs` or `app/analysis.mjs`. API error responses use an `error` field.

## Repository structure

```text
app/                 React pages, application logic, and API handlers
db/schema.ts         Database schema
drizzle/             Versioned SQL migrations
scripts/             Framework and local runtime helpers
worker/              Production Worker entry point
.openai/hosting.json Hosting binding declarations, without an existing Site ID
```

## Deployment

The existing MVP is hosted privately through Sites; its URL requires owner access and is not an anonymous public demo. A GitHub upload does not deploy this application or grant access to that private Site.

To deploy a new instance, register a new Site, retain the declared D1 binding, build the application, and publish using the Sites workflow. `.openai/hosting.json` intentionally omits the original project's Site ID. Deploying outside Sites requires replacing its authentication integration and configuring the hosting bindings.

## Limitations

The seeded events are fictional. Map links open an external service; an embedded map, distance-based matching, capacity controls, real-time messaging, and notifications are not implemented. Hosted authentication is supplied by the Sites platform; local preview uses its development-only identity simulation.

## Attribution

The application uses the Sites Vinext starter and third-party dependencies. Vendored components retain their bundled license notices, including the notices under `vendor/` and `scripts/vite/`. No competition awards, adoption statistics, or performance claims are borrowed from another applicant's projects.
