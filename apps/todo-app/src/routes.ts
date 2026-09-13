import { Router, type Request, type Response } from "express";
import { db } from "./db/index.js";

export const router = Router();

/**
 * GET /api/todos
 * GET /api/todos?completed=true
 * GET /api/todos?completed=false
 */
router.get("/todos", async (req: Request, res: Response) => {
  const { completed } = req.query;

  const where =
    completed === "true" ? { completed: true } : completed === "false" ? { completed: false } : undefined;

  const todos = await db.todo.findMany({
    where,
    orderBy: { id: "desc" },
  });
  res.json(todos);
});

router.post("/todos", async (req: Request, res: Response) => {
  const { title } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    return res.status(400).json({ error: "title is required" });
  }

  const todo = await db.todo.create({ title: title.trim(), completed: false });
  res.status(201).json(todo);
});

router.patch("/todos/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const { title, completed } = req.body ?? {};
  const patch: { title?: string; completed?: boolean } = {};
  if (typeof title === "string") patch.title = title;
  if (typeof completed === "boolean") patch.completed = completed;

  const [updated] = await db.todo.update({ id }, patch);
  if (!updated) {
    return res.status(404).json({ error: "todo not found" });
  }
  res.json(updated);
});

router.delete("/todos/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const [deleted] = await db.todo.delete({ id });
  if (!deleted) {
    return res.status(404).json({ error: "todo not found" });
  }
  res.status(204).send();
});
