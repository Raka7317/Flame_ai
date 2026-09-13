// The app only ever imports from "@lightorm/core", the package's public
// entry point — never from its internal files. This is exactly how a
// consumer would use the ORM if it were installed from npm.
import { defineModel, boolean, number, string, withDefault } from "@lightorm/core";

export const Todo = defineModel("todo", {
  id: withDefault(number()),
  title: string(),
  completed: boolean(),
});

export const models = { todo: Todo };
