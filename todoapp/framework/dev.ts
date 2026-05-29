// Local-first dev server.
//
//   bun framework/dev.ts        # http://localhost:3000  (set PORT to override)
//
// No build step: TypeScript/TSX is transpiled on demand straight from disk, the
// SQLite backend is served over a small REST API, and the browser live-reloads
// whenever a source file changes.
import { watch } from "fs";
import { Database } from "bun:sqlite";

const ROOT = `${import.meta.dir}/..`; // project root (this file lives in framework/)
const PORT = Number(process.env.PORT ?? 3000);
const sockets = new Set<Bun.ServerWebSocket>();
const RELOAD =
  `<script>new WebSocket("ws://"+location.host+"/__ws").onmessage=()=>location.reload()</script>`;

// SQLite backend: define real tables and query them with prepared statements.
const db = new Database(process.env.DB_PATH ?? `${ROOT}/db.sqlite3`);
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS todos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
const listTodos = db.query("SELECT id, text, done, created_at FROM todos ORDER BY done, id");
const insertTodo = db.query("INSERT INTO todos (text) VALUES (?) RETURNING id, text, done, created_at");
const toggleTodo = db.query("UPDATE todos SET done = NOT done WHERE id = ? RETURNING id, text, done, created_at");
const deleteTodo = db.query("DELETE FROM todos WHERE id = ?");

async function shell() {
  const html = await Bun.file(`${ROOT}/app/index.html`).text();
  return new Response(html.replace("</body>", `${RELOAD}\n</body>`), {
    headers: { "Content-Type": "text/html" },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const path = decodeURIComponent(new URL(req.url).pathname);

    if (path === "/__ws")
      return server.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });

    if (path === "/api/todos") {
      if (req.method === "GET") return Response.json(listTodos.all());
      if (req.method === "POST") {
        const { text } = (await req.json()) as { text: string };
        return Response.json(insertTodo.get(text));
      }
    }
    const todo = path.match(/^\/api\/todos\/(\d+)$/);
    if (todo) {
      const id = Number(todo[1]);
      if (req.method === "PATCH") return Response.json(toggleTodo.get(id));
      if (req.method === "DELETE") {
        deleteTodo.run(id);
        return Response.json({ ok: true });
      }
    }

    // Transpile TypeScript / TSX on demand.
    if (/\.tsx?$/.test(path)) {
      const out = await Bun.build({ entrypoints: [ROOT + path] });
      if (!out.success) return new Response(out.logs.join("\n"), { status: 500 });
      return new Response(await out.outputs[0].text(), {
        headers: { "Content-Type": "text/javascript" },
      });
    }

    // Serve any real file off disk; otherwise fall back to the SPA shell.
    const file = Bun.file(ROOT + path);
    if (path !== "/" && (await file.exists())) return new Response(file);
    return shell();
  },
  websocket: {
    open: (ws) => void sockets.add(ws),
    close: (ws) => void sockets.delete(ws),
    message: () => {},
  },
});

watch(ROOT, { recursive: true }, (_, file) => {
  if (!file) return;
  if (file.startsWith("db.sqlite3") || file.startsWith("node_modules") || file.startsWith("dist")) return;
  if (/\.(html|css|tsx?|js)$/.test(file)) {
    console.log(`changed: ${file}`);
    for (const ws of sockets) ws.send("reload");
  }
});

console.log(`dev → http://localhost:${server.port}`);
