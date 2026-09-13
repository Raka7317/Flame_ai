/**
 * Schema definition layer.
 *
 * A "field" is a tiny descriptor object that carries a *phantom* TypeScript
 * type (the `__type` property never exists at runtime) alongside a runtime
 * `kind` string used for SQL generation. This is the trick that lets us
 * infer a fully-typed row shape from a plain object of field builders
 * without the caller ever writing an interface by hand.
 */

export type ColumnKind = "number" | "string" | "boolean" | "date";

// `HasDefault` is carried as its own literal type parameter (rather than
// just a `boolean` property) so that `DefaultedKeys` below can pattern-match
// on the literal `true`/`false` at the type level. If `hasDefault` were
// typed as plain `boolean`, TypeScript would widen it and every field would
// look "possibly defaulted", breaking the create()-input inference.
export interface FieldDef<T, HasDefault extends boolean = boolean> {
  readonly kind: ColumnKind;
  readonly nullable: boolean;
  readonly hasDefault: HasDefault;
  /** Phantom type marker — never assigned, only used by `InferField`. */
  readonly __type?: T;
}

function makeField<T>(kind: ColumnKind): FieldDef<T, false> {
  return { kind, nullable: false, hasDefault: false };
}

export function number(): FieldDef<number, false> {
  return makeField<number>("number");
}

export function string(): FieldDef<string, false> {
  return makeField<string>("string");
}

export function boolean(): FieldDef<boolean, false> {
  return makeField<boolean>("boolean");
}

export function date(): FieldDef<Date, false> {
  return makeField<Date>("date");
}

/** Wrap any field to make it nullable: `nullable(string())`. */
export function nullable<T, D extends boolean>(field: FieldDef<T, D>): FieldDef<T | null, D> {
  return { ...field, nullable: true } as FieldDef<T | null, D>;
}

/**
 * Marks a field as DB-generated (e.g. serial primary keys, timestamps with
 * defaults). Fields with `hasDefault: true` become optional on `create()`.
 */
export function withDefault<T>(field: FieldDef<T, boolean>): FieldDef<T, true> {
  return { ...field, hasDefault: true };
}

// ---- Type-level inference -------------------------------------------------

export type InferField<F> = F extends FieldDef<infer T> ? T : never;

export type ModelShape = Record<string, FieldDef<any>>;

/** Full row type for a model, exactly as it comes back from the database. */
export type InferShape<Shape extends ModelShape> = {
  [K in keyof Shape]: InferField<Shape[K]>;
};

/** Field names that the DB fills in on its own (defaulted columns). */
export type DefaultedKeys<Shape extends ModelShape> = {
  [K in keyof Shape]: Shape[K]["hasDefault"] extends true ? K : never;
}[keyof Shape];

/**
 * Input type for `create()`: defaulted columns (like an auto-increment id)
 * become optional, everything else is required.
 */
export type CreateInput<Shape extends ModelShape> = Omit<InferShape<Shape>, DefaultedKeys<Shape>> &
  Partial<Pick<InferShape<Shape>, DefaultedKeys<Shape>>>;

/** Input type for `update()`: every column is optional (partial patch). */
export type UpdateInput<Shape extends ModelShape> = Partial<InferShape<Shape>>;

/** Input type for `where()`: exact-match filters, every column optional. */
export type WhereInput<Shape extends ModelShape> = Partial<InferShape<Shape>>;

// ---- Model definition -------------------------------------------------

export interface ModelDefinition<Name extends string = string, Shape extends ModelShape = ModelShape> {
  readonly name: Name;
  readonly tableName: string;
  readonly shape: Shape;
}

export interface DefineModelOptions {
  /** Override the SQL table name (defaults to the model name). */
  tableName?: string;
}

/**
 * Define a model.
 *
 * ```ts
 * const Todo = defineModel("todo", {
 *   id: withDefault(number()),
 *   title: string(),
 *   completed: boolean(),
 * });
 * ```
 */
export function defineModel<Name extends string, Shape extends ModelShape>(
  name: Name,
  shape: Shape,
  options: DefineModelOptions = {},
): ModelDefinition<Name, Shape> {
  return {
    name,
    shape,
    tableName: options.tableName ?? name,
  };
}
