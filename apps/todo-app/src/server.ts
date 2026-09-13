import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { router } from "./routes.js";
import { initDb } from "./db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());
app.use("/api", router);

// Serve the frontend.
app.use(express.static(path.join(__dirname, "public")));

async function main() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Todo app listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
