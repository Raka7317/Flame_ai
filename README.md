# light-orm — a lightweight, fully-typed TypeScript ORM

A monorepo containing:

- **`packages/orm`** (`@lightorm/core`) — the ORM itself.
- **`apps/todo-app`** — a small Express + vanilla-JS Todo app that consumes the ORM
  as a normal workspace dependency (only ever importing `@lightorm/core`, never
  reaching into the package's internal files).

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for design details, query flow, and
type-system tradeoffs.

---

## 1. Setup

Requires Node.js 20+.

```bash
git clone <this-repo>
cd orm-assignment
npm install       # installs and links both workspaces
npm run build     # builds @lightorm/core, then todo-app
```

## 2. Database configuration

The Todo app needs a Postgres connection string (Neon, Supabase, or local
Postgres all work — the ORM only assumes standard Postgres wire protocol).

```bash
cd apps/todo-app
cp .env.example .env
# edit .env and set DATABASE_URL to your connection string
```

- **Neon / Supabase (serverless Postgres):** copy the connection string from
  your project dashboard. SSL is required and enabled by default.
- **Local Postgres:** set `DATABASE_URL` to your local connection string and
  uncomment `PGSSL=disable` in `.env` (local Postgres usually isn't configured
  for SSL).

The app creates its own table on startup (see `initDb()` in
`apps/todo-app/src/db/index.ts`) — there's no separate migration step to run.

## 3. Running the Todo app

```bash
npm run build
npm start
# → Todo app listening on http://localhost:3000
```

Open `http://localhost:3000` in a browser. You can create todos, mark them
complete, delete them, and filter by All / Active / Completed.

During development, run the two workspaces' `--watch` builds in separate
terminals (`npm run dev:orm` and `npm run dev:app`) and use `npm start` or a
process manager like `nodemon dist/server.js` to reload the running server.

## 4. Running the ORM's tests

```bash
npm test
```

This runs the query-builder / SQL-compiler unit tests in
`packages/orm/src/sql.test.ts` — they exercise SQL generation directly and
don't require a live database.

## 5. Publishing the ORM to npm

Inside this monorepo, `todo-app` depends on `@lightorm/core` via the npm
workspace link (`"@lightorm/core": "*"` in `apps/todo-app/package.json`),
which is how a real npm-published dependency behaves once linked locally —
the app only ever sees the package's public exports (`dist/index.js` +
`dist/index.d.ts`), never its `src/`.

To publish it for real:

```bash
cd packages/orm
npm run build
npm publish --access public   # requires an npm account; adjust the "name"
                               # field in package.json to your own scope first,
                               # e.g. "@yourname/light-orm"
```

After publishing, `apps/todo-app/package.json` can point at the published
version (`"@yourname/light-orm": "^0.1.0"`) instead of the workspace link.

## 6. AI tool disclosure

This project was built with assistance from Claude (Anthropic). Claude was
used to scaffold the monorepo structure, implement the ORM's schema/type
inference layer, query builder, SQL compiler, client, and the Todo app's
backend/frontend, and to write this documentation. All generated code was
reviewed, compiled, and tested (`npm run build`, `npm test`, and a manual
`tsc --noEmit` check with `@ts-expect-error` assertions confirming the type
system rejects invalid queries) before inclusion.

## 7. Known limitations

- **No relations.** Only flat, single-table models — no foreign keys, joins,
  or `include`-style eager loading.
- **No real migration system.** `syncSchema()` runs `CREATE TABLE IF NOT
  EXISTS` on startup, inferring column types from the schema. It won't alter
  existing tables if a schema changes (no `ALTER TABLE` diffing).
- **Limited query operators.** `where` only supports exact-match equality
  per field (`AND`-ed together). No `gt`/`lt`/`in`/`like`/`OR` operators yet.
- **No transactions.** Each ORM call issues a single query; there's no
  `db.$transaction(...)` API.
- **No connection pooling policy beyond `pg.Pool` defaults.** Fine for a
  small app; a production ORM would want explicit pool sizing/timeout
  configuration surfaced in the client API.
- **`id` convention, not enforcement.** The ORM assumes every model has an
  `id` field created with `withDefault(number())`, used as an implicit
  primary key by `syncSchema`. This isn't type-enforced — a model without
  an `id` field will just skip the `SERIAL PRIMARY KEY` special case.

## 8. Time spent

Roughly one focused work session covering: ORM core (schema, query builder,
SQL compiler, client), the Todo app (backend + frontend), unit tests, and
documentation.
