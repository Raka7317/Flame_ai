// Public API surface. Consumers should only ever import from here —
// `client.ts`, `query-builder.ts`, and `sql.ts` are implementation details.

export { defineModel, number, string, boolean, date, nullable, withDefault } from "./schema.js";
export type {
  ModelDefinition,
  ModelShape,
  FieldDef,
  InferShape,
  CreateInput,
  UpdateInput,
  WhereInput,
} from "./schema.js";

export { createClient, syncSchema } from "./client.js";
export type { Client, ModelClient, ModelsMap, QueryExecutor } from "./client.js";

export type { FindManyArgs, OrderDirection, QueryPlan } from "./query-builder.js";
export type { CompiledQuery } from "./sql.js";
