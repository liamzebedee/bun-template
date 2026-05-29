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
// This `items` table is the example to replace with your own schema.
const db = new Database(process.env.DB_PATH ?? `${ROOT}/db.sqlite3`);
db.exec(`PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
const listItems = db.query("SELECT id, text, created_at FROM items ORDER BY id");
const insertItem = db.query("INSERT INTO items (text) VALUES (?) RETURNING id, text, created_at");
const deleteItem = db.query("DELETE FROM items WHERE id = ?");

async function shell() {
  const html = await Bun.file(`${ROOT}/index.html`).text();
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

    if (path === "/api/items") {
      if (req.method === "GET") return Response.json(listItems.all());
      if (req.method === "POST") {
        const { text } = (await req.json()) as { text: string };
        return Response.json(insertItem.get(text));
      }
    }
    const item = path.match(/^\/api\/items\/(\d+)$/);
    if (item && req.method === "DELETE") {
      deleteItem.run(Number(item[1]));
      return Response.json({ ok: true });
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
