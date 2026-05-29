import { watch, existsSync, readFileSync } from "fs";
import { Database } from "bun:sqlite";

type Meal = { id: string; name: string; ingredients: string };
type SlotItem =
  | { type: "meal"; mealId: string }
  | { type: "snack"; name: string }
  | { type: "veggie"; name: string }
  | { type: "gym"; name: string };
type Slot = { items: SlotItem[] };
type Week = Record<string, Slot[]>;
type Log = Record<string, Slot[]>;
type Macros = { protein: number; fat: number; carb: number; energy: number; yield?: number; portion?: number; data_source?: "afcd" | "llm" };
type Nutrition = Record<string, Macros>;
type Data = { meals: Meal[]; snacks: string; veggies: string; gym: string; week: Week; log: Log; nutrition: Nutrition };

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DB_PATH = process.env.DB_PATH ?? "db.sqlite3";
const PORT = Number(process.env.PORT ?? 3001);
const db = new Database(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ingredients TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function emptyWeek(): Week {
  return Object.fromEntries(DAYS.map((d) => [d, [{ items: [] }, { items: [] }, { items: [] }]]));
}

function defaultData(): Data {
  return { meals: [], snacks: "", veggies: "", gym: "", week: emptyWeek(), log: {}, nutrition: {} };
}

function loadData(): Data {
  const meals = db.query("SELECT id, name, ingredients FROM meals ORDER BY rowid").all() as Meal[];
  const kvVal = (k: string) => (db.query("SELECT value FROM kv WHERE key=?").get(k) as { value: string } | null)?.value;
  let week: Week = emptyWeek();
  const wk = kvVal("week");
  if (wk) {
    try {
      const parsed = JSON.parse(wk) as Week;
      for (const day of DAYS) if (parsed[day]) week[day] = parsed[day];
    } catch {}
  }
  let log: Log = {};
  const lg = kvVal("log");
  if (lg) {
    try { log = JSON.parse(lg) as Log; } catch {}
  }
  let nutrition: Nutrition = {};
  const nu = kvVal("nutrition");
  if (nu) {
    try { nutrition = JSON.parse(nu) as Nutrition; } catch {}
  }
  return {
    meals,
    snacks: kvVal("snacks") ?? "",
    veggies: kvVal("veggies") ?? "",
    gym: kvVal("gym") ?? "",
    week,
    log,
    nutrition,
  };
}

function saveData(d: Data) {
  const tx = db.transaction(() => {
    db.exec("DELETE FROM meals");
    const insertMeal = db.prepare("INSERT INTO meals (id, name, ingredients) VALUES (?, ?, ?)");
    for (const m of d.meals ?? []) insertMeal.run(m.id, m.name, m.ingredients ?? "");
    const upsertKv = db.prepare(
      "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    );
    upsertKv.run("snacks", d.snacks ?? "");
    upsertKv.run("veggies", d.veggies ?? "");
    upsertKv.run("gym", d.gym ?? "");
    upsertKv.run("week", JSON.stringify(d.week ?? emptyWeek()));
    upsertKv.run("log", JSON.stringify(d.log ?? {}));
    upsertKv.run("nutrition", JSON.stringify(d.nutrition ?? {}));
  });
  tx();
}

// Seed if empty (rebuild after deletion).
if ((db.query("SELECT COUNT(*) AS n FROM meals").get() as { n: number }).n === 0 &&
    (db.query("SELECT COUNT(*) AS n FROM kv").get() as { n: number }).n === 0) {
  const week = emptyWeek();
  week.mon = [{ items: [{ type: "meal", mealId: "m1" }] }, { items: [] }, { items: [] }];
  week.tue = [{ items: [{ type: "meal", mealId: "m1" }, { type: "meal", mealId: "m1" }] }, { items: [] }, { items: [] }];
  week.wed = [{ items: [{ type: "meal", mealId: "m1" }] }, { items: [] }, { items: [] }];
  week.thu = [{ items: [{ type: "meal", mealId: "m1" }] }, { items: [] }, { items: [] }];
  saveData({
    meals: [{ id: "m1", name: "lunch", ingredients: "200g chicken" }],
    snacks: "apple\nyogurt",
    veggies: "",
    gym: "",
    week,
  });
  console.log("Seeded db.sqlite3 with restored data");
}

// One-shot migration from legacy data.json (if user later restores it).
if (existsSync("data.json")) {
  try {
    const d = JSON.parse(readFileSync("data.json", "utf8"));
    if (d && Array.isArray(d.meals)) {
      saveData({
        meals: d.meals,
        snacks: d.snacks ?? "",
        veggies: d.veggies ?? "",
        gym: d.gym ?? "",
        week: d.week ?? emptyWeek(),
      });
      console.log("Migrated data.json → db.sqlite3");
    }
  } catch (e) {
    console.warn("data.json migration skipped:", (e as Error).message);
  }
}

const sockets = new Set<any>();

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const { pathname } = new URL(req.url);

    if (pathname === "/__ws") {
      if (server.upgrade(req)) return;
      return new Response("Upgrade failed", { status: 400 });
    }

    if (pathname === "/api/data" && req.method === "GET") {
      return Response.json(loadData());
    }

    if (pathname === "/api/data" && req.method === "PUT") {
      const body = (await req.json()) as Data;
      saveData(body);
      return Response.json({ ok: true });
    }

    let resolved = pathname === "/" ? "/index.html" : pathname;
    resolved = decodeURIComponent(resolved);

    if (/\.tsx?$/.test(resolved)) {
      const result = await Bun.build({ entrypoints: ["." + resolved] });
      if (result.success) {
        return new Response(await result.outputs[0].text(), {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      return new Response("Build failed:\n" + result.logs.join("\n"), { status: 500 });
    }

    const file = Bun.file("." + resolved);
    if (!(await file.exists())) {
      const idx = Bun.file("./index.html");
      let html = await idx.text();
      html = html.replace(
        "</body>",
        `<script>new WebSocket("ws://"+location.host+"/__ws").onmessage=()=>location.reload()</script>\n</body>`
      );
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    if (resolved.endsWith(".html")) {
      let html = await file.text();
      html = html.replace(
        "</body>",
        `<script>new WebSocket("ws://"+location.host+"/__ws").onmessage=()=>location.reload()</script>\n</body>`
      );
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response(file);
  },
  websocket: {
    open(ws) { sockets.add(ws); },
    close(ws) { sockets.delete(ws); },
    message() {},
  },
});

watch(".", { recursive: true }, (_, filename) => {
  if (!filename || filename === "dev.ts") return;
  if (filename.startsWith("db.sqlite3")) return;
  if (/\.(html|css|tsx|ts)$/.test(filename)) {
    console.log(`Changed: ${filename}`);
    for (const ws of sockets) ws.send("reload");
  }
});

console.log(`Server: http://localhost:${server.port} (db: ${DB_PATH})`);
