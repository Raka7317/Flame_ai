/**
 * Query builder.
 *
 * This layer knows nothing about SQL. It turns typed method calls
 * (`findMany`, `create`, ...) into a small, database-agnostic `QueryPlan`
 * object. Keeping this separate from SQL generation (`sql.ts`) means a
 * different backend (e.g. a different SQL dialect) only needs a new
 * compiler, not a rewritten query builder.
 */

import type { ModelShape, WhereInput } from "./schema.js";

export type OrderDirection = "asc" | "desc";

export interface FindManyArgs<Shape extends ModelShape> {
  where?: WhereInput<Shape>;
  orderBy?: Partial<Record<keyof Shape, OrderDirection>>;
  limit?: number;
  offset?: number;
}

export interface FindUniqueArgs<Shape extends ModelShape> {
  where: WhereInput<Shape>;
}

export type QueryPlan =
  | {
      type: "select";
      table: string;
      where: Array<{ column: string; value: unknown }>;
      orderBy: Array<{ column: string; direction: OrderDirection }>;
      limit?: number;
      offset?: number;
    }
  | {
      type: "insert";
      table: string;
      data: Record<string, unknown>;
    }
  | {
      type: "update";
      table: string;
      where: Array<{ column: string; value: unknown }>;
      data: Record<string, unknown>;
    }
  | {
      type: "delete";
      table: string;
      where: Array<{ column: string; value: unknown }>;
    };

function whereEntries(where: Record<string, unknown> | undefined): Array<{ column: string; value: unknown }> {
  if (!where) return [];
  return Object.entries(where)
    .filter(([, value]) => value !== undefined)
    .map(([column, value]) => ({ column, value }));
}

export class QueryBuilder<Shape extends ModelShape> {
  constructor(private readonly table: string) {}

  select(args: FindManyArgs<Shape> = {}): QueryPlan {
    const orderBy = args.orderBy
      ? (Object.entries(args.orderBy) as Array<[string, OrderDirection]>).map(([column, direction]) => ({
          column,
          direction,
        }))
      : [];

    return {
      type: "select",
      table: this.table,
      where: whereEntries(args.where as Record<string, unknown> | undefined),
      orderBy,
      limit: args.limit,
      offset: args.offset,
    };
  }

  insert(data: Record<string, unknown>): QueryPlan {
    return { type: "insert", table: this.table, data };
  }

  update(where: WhereInput<Shape>, data: Record<string, unknown>): QueryPlan {
    return {
      type: "update",
      table: this.table,
      where: whereEntries(where as Record<string, unknown>),
      data,
    };
  }

  delete(where: WhereInput<Shape>): QueryPlan {
    return {
      type: "delete",
      table: this.table,
      where: whereEntries(where as Record<string, unknown>),
    };
  }
}
