import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryBuilder } from "./query-builder.js";
import { compile } from "./sql.js";

test("select with where + orderBy + limit compiles to parameterized SQL", () => {
  const qb = new QueryBuilder<any>("todo");
  const plan = qb.select({
    where: { completed: false },
    orderBy: { id: "desc" },
    limit: 5,
  });
  const { text, values } = compile(plan);

  assert.equal(
    text,
    'SELECT * FROM "todo" WHERE "completed" = $1 ORDER BY "id" DESC LIMIT $2',
  );
  assert.deepEqual(values, [false, 5]);
});

test("insert compiles RETURNING * with positional params", () => {
  const qb = new QueryBuilder<any>("todo");
  const plan = qb.insert({ title: "Write docs", completed: false });
  const { text, values } = compile(plan);

  assert.equal(
    text,
    'INSERT INTO "todo" ("title", "completed") VALUES ($1, $2) RETURNING *',
  );
  assert.deepEqual(values, ["Write docs", false]);
});

test("update compiles SET + WHERE", () => {
  const qb = new QueryBuilder<any>("todo");
  const plan = qb.update({ id: 1 }, { completed: true });
  const { text, values } = compile(plan);

  assert.equal(
    text,
    'UPDATE "todo" SET "completed" = $1 WHERE "id" = $2 RETURNING *',
  );
  assert.deepEqual(values, [true, 1]);
});

test("delete compiles WHERE clause", () => {
  const qb = new QueryBuilder<any>("todo");
  const plan = qb.delete({ id: 1 });
  const { text, values } = compile(plan);

  assert.equal(text, 'DELETE FROM "todo" WHERE "id" = $1 RETURNING *');
  assert.deepEqual(values, [1]);
});

test("select with no filters compiles to a bare SELECT", () => {
  const qb = new QueryBuilder<any>("todo");
  const plan = qb.select();
  const { text, values } = compile(plan);

  assert.equal(text, 'SELECT * FROM "todo"');
  assert.deepEqual(values, []);
});

test("rejects invalid identifiers to guard against injection via table/column names", () => {
  const qb = new QueryBuilder<any>('todo"; DROP TABLE users; --');
  const plan = qb.select();
  assert.throws(() => compile(plan), /Invalid identifier/);
});
