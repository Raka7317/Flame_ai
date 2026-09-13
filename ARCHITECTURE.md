# Architecture

## Query flow

```
Model API (db.todo.findMany)
        │
        ▼
QueryBuilder<Shape>            packages/orm/src/query-builder.ts
  turns typed args into a
  database-agnostic QueryPlan
        │
        ▼
compile(plan)                  packages/orm/src/sql.ts
  turns the QueryPlan into
  parameterized SQL text + values
        │
        ▼
pg.Pool#query(text, values)    apps/todo-app/src/db/index.ts
        │
        ▼
Rows mapped back to InferShape<Shape>[]   packages/orm/src/client.ts
```

Each stage only depends on the one below it, and none of them depend on
Express or the Todo app — the ORM package has zero knowledge that a Todo app
exists. This is what makes it a reusable package rather than app-specific
plumbing:

- `schema.ts` — no dependencies. Pure types + field builders.
- `query-builder.ts` — depends only on `schema.ts`'s types. Produces a plain
  `QueryPlan` object (a small tagged union), not SQL.
- `sql.ts` — depends only on `query-builder.ts`'s `QueryPlan` type. Pure
  function: `QueryPlan -> { text, values }`. No I/O, fully unit-testable
  (see `sql.test.ts`).
- `client.ts` — the only layer that touches `pg`. Wires a `QueryExecutor`
  (anything with a `.query(text, values)` method — `pg.Pool` satisfies this
  structurally) to the query builder and SQL compiler, and maps rows back
  to typed objects.

Splitting query building from SQL generation was a deliberate choice: it
means adding a different SQL dialect later only requires a new `compile()`
implementation, not touching how models express `where`/`orderBy`/etc.

## ORM design

### How models are defined

A model is a name plus a **shape**: a plain object mapping column names to
*field builders* (`number()`, `string()`, `boolean()`, `date()`, and the
modifiers `nullable(...)` / `withDefault(...)`).

```ts
const Todo = defineModel("todo", {
  id: withDefault(number()),
  title: string(),
  completed: boolean(),
});
```

`defineModel` doesn't do anything clever at runtime — it just returns
`{ name, tableName, shape }`. All the interesting behavior comes from what
TypeScript can infer *from* that shape (see below).

### How queries are executed

`createClient(pool, { todo: Todo })` builds one `ModelClient` per model. Each
`ModelClient` exposes `findMany`, `findUnique`, `create`, `update`, `delete` —
all of which follow the same three-step path (build a plan → compile to SQL
→ execute) described in "Query flow" above.

There is a `syncSchema(pool, models)` dev helper that runs `CREATE TABLE IF
NOT EXISTS` for each model, inferring `SERIAL PRIMARY KEY` / `TEXT` /
`BOOLEAN` / `DOUBLE PRECISION` / `TIMESTAMPTZ` from each field's `kind`. This
is explicitly **not** a migration system — see Limitations.

## TypeScript design

### How types are inferred

Each field builder returns a `FieldDef<T, HasDefault>` — a small object that
carries a **phantom type parameter** `T` (it's declared as an optional
property, `__type?: T`, and never actually assigned a value at runtime; it
exists purely so TypeScript can talk about "the type this field represents").

```ts
export interface FieldDef<T, HasDefault extends boolean = boolean> {
  readonly kind: ColumnKind;
  readonly nullable: boolean;
  readonly hasDefault: HasDefault;
  readonly __type?: T;
}
```

From a shape (`Record<string, FieldDef<any, any>>`), a mapped type pulls out
each field's `T`:

```ts
type InferField<F> = F extends FieldDef<infer T> ? T : never;

type InferShape<Shape> = {
  [K in keyof Shape]: InferField<Shape[K]>;
};
```

This is the whole trick: `InferShape<typeof Todo.shape>` resolves to
`{ id: number; title: string; completed: boolean }` automatically. Nobody
writes that interface by hand, and it can never drift out of sync with the
schema, because it's derived *from* the schema.

`CreateInput<Shape>` builds on this by also tracking which fields are
DB-generated:

```ts
type DefaultedKeys<Shape> = {
  [K in keyof Shape]: Shape[K]["hasDefault"] extends true ? K : never;
}[keyof Shape];

type CreateInput<Shape> = Omit<InferShape<Shape>, DefaultedKeys<Shape>> &
  Partial<Pick<InferShape<Shape>, DefaultedKeys<Shape>>>;
```

So `db.todo.create({ title, completed })` type-checks (no `id` needed),
while `db.todo.create({ completed: false })` is a compile error (missing
`title`) and `db.todo.create({ title: "x", completed: "nope" })` is a
compile error (`completed` must be `boolean`). This is verified directly in
development via `@ts-expect-error` assertions against the real `db` client
— not just against hand-written test types — so the check exercises the
exact same inference the Todo app relies on.

### Tradeoffs in the type system

- **`HasDefault` has to be its own literal type parameter, not just a
  `boolean` field.** An earlier version stored `hasDefault: boolean` as a
  plain property; TypeScript widens object literals so every field looked
  "possibly defaulted" and `CreateInput` couldn't tell defaulted columns
  apart from required ones. Making `HasDefault extends boolean` its own
  generic parameter (defaulting to `boolean` when unconstrained) keeps the
  literal `true`/`false` visible to `DefaultedKeys`.
- **No runtime validation.** The type system catches mistakes at compile
  time (wrong field name, wrong type, missing required field), but nothing
  stops a malformed value from a JSON request body (like the Todo app's
  Express routes) from reaching the ORM at runtime. The Todo app's routes do
  their own manual `typeof` checks on `req.body` for this reason — a
  proper validation layer (zod-style, generated from the same field
  definitions) is listed as a bonus/limitation rather than implemented here.
- **`where` is a flat `Partial<InferShape<Shape>>`, not an operator DSL.**
  This keeps the types simple (every field is just optionally itself) at
  the cost of expressiveness — see Limitations for what this rules out.

## Package architecture

- `packages/orm` builds to `dist/` with `tsc` (declaration files + source
  maps included) and exposes a single entry point via `package.json#exports`
  (`dist/index.js` / `dist/index.d.ts`). Everything not re-exported from
  `src/index.ts` (the query builder, SQL compiler, and their types) is an
  internal implementation detail — the Todo app never imports from them
  directly, only from `@lightorm/core`.
- `apps/todo-app` depends on `@lightorm/core` as `"*"` in its
  `package.json`, resolved via npm workspaces to the local package. This is
  exactly how it would resolve a real published version — the only thing
  that changes when you `npm publish` the ORM and swap the dependency
  range is where the package comes from, not how the app uses it.
- `pg` is a peer dependency of `@lightorm/core` (declared, not bundled) so
  the app controls its own driver version and there's only one `pg`
  instance/connection pool in the process.

## Limitations

- No relation/foreign-key support (bonus, not implemented).
- No query chaining or builder-style fluent API — arguments are passed as
  plain objects (`{ where, orderBy, limit }`).
- No migration system — `syncSchema` is a `CREATE TABLE IF NOT EXISTS`
  convenience, not a diffing migration tool.
- `where` only supports equality filters, combined with `AND`. No
  `gt`/`lt`/`like`/`in`/`OR`.
- No transaction support.
- No validation layer beyond TypeScript's compile-time checks.
