/**
 * Client layer.
 *
 * Wires everything together: for each model, exposes typed `findMany`,
 * `findUnique`, `create`, `update`, and `delete` methods. This is the only
 * layer that touches the actual database driver (`pg`), which keeps the
 * query-builder and SQL layers fully testable without a live database.
 */

import type { Pool, QueryResult } from "pg";
import {
  type CreateInput,
  type InferShape,
  type ModelDefinition,
  type ModelShape,
  type UpdateInput,
  type WhereInput,
} from "./schema.js";
import { QueryBuilder, type FindManyArgs } from "./query-builder.js";
import { compile } from "./sql.js";

/** Minimal shape the ORM needs from a driver — `pg.Pool` satisfies this. */
export interface QueryExecutor {
  query(text: string, values?: unknown[]): Promise<QueryResult<any>>;
}

export class ModelClient<Shape extends ModelShape> {
  private readonly builder: QueryBuilder<Shape>;

  constructor(
    private readonly db: QueryExecutor,
    private readonly model: ModelDefinition<string, Shape>,
  ) {
    this.builder = new QueryBuilder<Shape>(model.tableName);
  }

  async findMany(args: FindManyArgs<Shape> = {}): Promise<InferShape<Shape>[]> {
    const plan = this.builder.select(args);
    const { text, values } = compile(plan);
    const result = await this.db.query(text, values);
    return result.rows as InferShape<Shape>[];
  }

  async findUnique(args: { where: WhereInput<Shape> }): Promise<InferShape<Shape> | null> {
    const plan = this.builder.select({ where: args.where, limit: 1 });
    const { text, values } = compile(plan);
    const result = await this.db.query(text, values);
    return (result.rows[0] as InferShape<Shape> | undefined) ?? null;
  }

  async create(data: CreateInput<Shape>): Promise<InferShape<Shape>> {
    const plan = this.builder.insert(data as Record<string, unknown>);
    const { text, values } = compile(plan);
    const result = await this.db.query(text, values);
    return result.rows[0] as InferShape<Shape>;
  }

  async update(where: WhereInput<Shape>, data: UpdateInput<Shape>): Promise<InferShape<Shape>[]> {
    const plan = this.builder.update(where, data as Record<string, unknown>);
    const { text, values } = compile(plan);
    const result = await this.db.query(text, values);
    return result.rows as InferShape<Shape>[];
  }

  async delete(where: WhereInput<Shape>): Promise<InferShape<Shape>[]> {
    const plan = this.builder.delete(where);
    const { text, values } = compile(plan);
    const result = await this.db.query(text, values);
    return result.rows as InferShape<Shape>[];
  }
}

export type ModelsMap = Record<string, ModelDefinition<string, any>>;

export type Client<Models extends ModelsMap> = {
  [K in keyof Models]: Models[K] extends ModelDefinition<string, infer S> ? ModelClient<S> : never;
};

/**
 * Create a typed database client from a Postgres pool and a set of models.
 *
 * ```ts
 * const db = createClient(pool, { todo: Todo });
 * await db.todo.findMany({ where: { completed: false } });
 * ```
 */
export function createClient<Models extends ModelsMap>(db: QueryExecutor, models: Models): Client<Models> {
  const client = {} as Client<Models>;
  for (const [key, model] of Object.entries(models)) {
    (client as any)[key] = new ModelClient(db, model);
  }
  return client;
}

const KIND_TO_SQL: Record<string, string> = {
  number: "DOUBLE PRECISION",
  string: "TEXT",
  boolean: "BOOLEAN",
  date: "TIMESTAMPTZ",
};

/**
 * Development convenience: creates tables for the given models if they
 * don't already exist, inferring column types from the schema. This is a
 * substitute for a real migration system (out of scope for this project —
 * see ARCHITECTURE.md limitations).
 *
 * The `id` column is special-cased to a serial primary key, since every
 * model in this ORM is expected to define an `id: withDefault(number())`
 * field as its primary key.
 */
export async function syncSchema(db: QueryExecutor, models: ModelsMap): Promise<void> {
  for (const model of Object.values(models)) {
    const shape = model.shape as Record<string, { kind: string; nullable: boolean }>;
    const columns = Object.entries(shape).map(([colName, field]) => {
      if (colName === "id") {
        return `"id" SERIAL PRIMARY KEY`;
      }
      const sqlType = KIND_TO_SQL[field.kind] ?? "TEXT";
      const nullability = field.nullable ? "" : " NOT NULL";
      return `"${colName}" ${sqlType}${nullability}`;
    });
    const text = `CREATE TABLE IF NOT EXISTS "${model.tableName}" (${columns.join(", ")})`;
    await db.query(text);
  }
}
