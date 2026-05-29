import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { activateTabs } from "../framework/lib/layouts/tabs/tabs";

// Mirrors the `todos` table in framework/dev.ts. Talks to the SQLite-backed API.
type Todo = { id: number; text: string; done: number; created_at: string };

// Module-scoped cache. Turbolinks re-mounts React into a fresh `#root` on every
// navigation; seeding from this cache means the new page renders *with data* the
// instant it's swapped in, so turbolinks' cross-fade fades real content (not an
// empty box) into view. The module only evaluates once, so the cache persists.
let cache: Todo[] = [];

// --- shared todo state --------------------------------------------------------
function useTodos() {
  const [todos, setTodos] = useState<Todo[]>(cache);
  const load = () =>
    fetch("/api/todos")
      .then((r) => r.json())
      .then((data: Todo[]) => { cache = data; setTodos(data); });
  useEffect(() => { load(); }, []);

  const add = async (text: string) => {
    if (!text.trim()) return;
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    load();
  };
  const toggle = async (id: number) => {
    await fetch(`/api/todos/${id}`, { method: "PATCH" });
    load();
  };
  const remove = async (id: number) => {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    load();
  };
  return { todos, add, toggle, remove };
}

type TodoApi = ReturnType<typeof useTodos>;

function TodoList({ items, toggle, remove }: { items: Todo[]; toggle: TodoApi["toggle"]; remove: TodoApi["remove"] }) {
  return (
    <ul>
      {items.map((t) => (
        <li key={t.id} className={t.done ? "done" : ""}>
          <label>
            <input type="checkbox" checked={!!t.done} onChange={() => toggle(t.id)} />
            <span>{t.text}</span>
          </label>
          <button onClick={() => remove(t.id)}>×</button>
        </li>
      ))}
    </ul>
  );
}

// --- pages (one per tab) ------------------------------------------------------
function ActivePage({ api }: { api: TodoApi }) {
  const [text, setText] = useState("");
  const active = api.todos.filter((t) => !t.done);
  const submit = () => { api.add(text); setText(""); };
  return (
    <div className="page">
      <div className="row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="what needs doing?"
          autoFocus
        />
        <button onClick={submit}>add</button>
      </div>
      {active.length ? (
        <TodoList items={active} toggle={api.toggle} remove={api.remove} />
      ) : (
        <p className="count">all done — nothing active</p>
      )}
    </div>
  );
}

function DonePage({ api }: { api: TodoApi }) {
  const done = api.todos.filter((t) => t.done);
  return (
    <div className="page">
      {done.length ? (
        <TodoList items={done} toggle={api.toggle} remove={api.remove} />
      ) : (
        <p className="count">nothing completed yet</p>
      )}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="page prose">
      <p>A tiny todo app built on the local-first app-template, using the tabs layout.</p>
      <p>The header bar lives outside the content shell, so clicking a tab cross-fades only the content (turbolinks-style) while the bar stays put.</p>
    </div>
  );
}

// Page for the current route. The header bar is rendered by the shell (index.html);
// React only owns the content shell.
function Page() {
  const api = useTodos();
  const path = location.pathname;
  if (path === "/done") return <DonePage api={api} />;
  if (path === "/about") return <AboutPage />;
  return <ActivePage api={api} />;
}

// Mount on first load and re-mount into the fresh `#root` after every turbolinks
// swap. flushSync commits synchronously so the content is painted in time to
// fade in with turbolinks' cross-fade rather than popping in afterward.
function mount() {
  const el = document.getElementById("root");
  if (el) flushSync(() => createRoot(el).render(<Page />));
}

activateTabs();      // highlight the active tab (also activates turbolinks)
mount();
window.addEventListener("turbo:load", mount);
