import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../framework/lib";

// Mirrors the `items` table in framework/dev.ts. Talks to the SQLite-backed API.
type Item = { id: number; text: string; created_at: string };

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");

  const load = () => fetch("/api/items").then((r) => r.json()).then(setItems);
  useEffect(() => { load(); }, []);

  async function add() {
    if (!text.trim()) return;
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    setText("");
    load();
  }

  async function remove(id: number) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="app">
      <h1>app template</h1>
      <div className="row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="add an item"
        />
        <button onClick={add}>add</button>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <span>{it.text}</span>
            <button onClick={() => remove(it.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
