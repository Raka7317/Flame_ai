/**
 * SQL generation.
 *
 * Compiles a `QueryPlan` (see query-builder.ts) into a parameterized SQL
 * string plus a values array, ready to hand to `pg`. All values are passed
 * as `$1, $2, ...` placeholders — never string-interpolated — so the ORM
 * is not vulnerable to SQL injection.
 */

import type { QueryPlan } from "./query-builder.js";

export interface CompiledQuery {
  text: string;
  values: unknown[];
}

function quoteIdent(name: string): string {
  // Basic identifier quoting. Table/column names come from the schema
  // definitions in code, not from user input, but we quote defensively
  // anyway and reject anything that isn't a plain identifier.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function compileWhere(
  where: Array<{ column: string; value: unknown }>,
  values: unknown[],
): string {
  if (where.length === 0) return "";
  const clauses = where.map(({ column, value }: { column: string; value: unknown }) => {
    values.push(value);
    return `${quoteIdent(column)} = $${values.length}`;
  });
  return ` WHERE ${clauses.join(" AND ")}`;
}

export function compile(plan: QueryPlan): CompiledQuery {
  const values: unknown[] = [];

  switch (plan.type) {
    case "select": {
      let text = `SELECT * FROM ${quoteIdent(plan.table)}`;
      text += compileWhere(plan.where, values);
      if (plan.orderBy.length > 0) {
        const order = plan.orderBy
          .map((o) => `${quoteIdent(o.column)} ${o.direction.toUpperCase()}`)
          .join(", ");
        text += ` ORDER BY ${order}`;
      }
      if (typeof plan.limit === "number") {
        values.push(plan.limit);
        text += ` LIMIT $${values.length}`;
      }
      if (typeof plan.offset === "number") {
        values.push(plan.offset);
        text += ` OFFSET $${values.length}`;
      }
      return { text, values };
    }

    case "insert": {
      const columns = Object.keys(plan.data);
      const placeholders = columns.map((col) => {
        values.push(plan.data[col]);
        return `$${values.length}`;
      });
      const text = `INSERT INTO ${quoteIdent(plan.table)} (${columns
        .map(quoteIdent)
        .join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
      return { text, values };
    }

    case "update": {
      const columns = Object.keys(plan.data);
      const setClauses = columns.map((col) => {
        values.push(plan.data[col]);
        return `${quoteIdent(col)} = $${values.length}`;
      });
      let text = `UPDATE ${quoteIdent(plan.table)} SET ${setClauses.join(", ")}`;
      text += compileWhere(plan.where, values);
      text += " RETURNING *";
      return { text, values };
    }

    case "delete": {
      let text = `DELETE FROM ${quoteIdent(plan.table)}`;
      text += compileWhere(plan.where, values);
      text += " RETURNING *";
      return { text, values };
    }

    default: {
      const _exhaustive: never = plan;
      throw new Error(`Unknown query plan type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
