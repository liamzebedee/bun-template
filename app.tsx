import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type Meal = { id: string; name: string; ingredients: string };

type SlotItem =
  | { type: "meal"; mealId: string }
  | { type: "snack"; name: string }
  | { type: "veggie"; name: string }
  | { type: "gym"; name: string };
type Slot = { items: SlotItem[] };
type Week = Record<string, Slot[]>;

type Log = Record<string, Slot[]>; // date "YYYY-MM-DD" -> 3 slots
type Macros = {
  protein: number; fat: number; carb: number; energy: number;
  yield?: number;     // informational only
  portion?: number;   // default grams per drag-in (snacks/veggies/gym)
  gi?: number;        // glycemic index (optional). Blank → carbs dosed 100% instant.
  data_source?: "afcd" | "llm";
};
type Nutrition = Record<string, Macros>; // key = lowercased ingredient name; values per 100g
type Data = { meals: Meal[]; snacks: string; veggies: string; gym: string; week: Week; log: Log; nutrition: Nutrition };

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function emptySlot(): Slot { return { items: [] }; }
function emptyWeek(): Week {
  return Object.fromEntries(DAYS.map((d) => [d, [emptySlot(), emptySlot(), emptySlot()]]));
}

function App() {
  const [data, setData] = useState<Data>({ meals: [], snacks: "", veggies: "", gym: "", week: emptyWeek(), log: {}, nutrition: {} });
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((d: any) => {
        const meals: Meal[] = (d.meals ?? []).map((m: any) => ({
          id: m.id, name: m.name, ingredients: m.ingredients ?? "",
        }));
        const week: Week = emptyWeek();
        if (d.week) {
          for (const day of DAYS) {
            const raw = d.week[day];
            if (!raw) continue;
            for (let i = 0; i < 3; i++) {
              const v = raw[i];
              const items: SlotItem[] = [];
              if (v && Array.isArray(v.items)) {
                for (const it of v.items) {
                  if (it?.type === "meal" && typeof it.mealId === "string") items.push({ type: "meal", mealId: it.mealId });
                  else if (it?.type === "snack" && typeof it.name === "string") items.push({ type: "snack", name: it.name });
                  else if (it?.type === "veggie" && typeof it.name === "string") items.push({ type: "veggie", name: it.name });
                  else if (it?.type === "gym" && typeof it.name === "string") items.push({ type: "gym", name: it.name });
                }
              }
              week[day][i] = { items };
            }
          }
        }
        const log: Log = {};
        if (d.log && typeof d.log === "object") {
          for (const [date, raw] of Object.entries(d.log) as [string, any][]) {
            if (!Array.isArray(raw)) continue;
            const slots: Slot[] = [emptySlot(), emptySlot(), emptySlot()];
            for (let i = 0; i < 3; i++) {
              const v = raw[i];
              const items: SlotItem[] = [];
              if (v && Array.isArray(v.items)) {
                for (const it of v.items) {
                  if (it?.type === "meal" && typeof it.mealId === "string") items.push({ type: "meal", mealId: it.mealId });
                  else if (it?.type === "snack" && typeof it.name === "string") items.push({ type: "snack", name: it.name });
                  else if (it?.type === "veggie" && typeof it.name === "string") items.push({ type: "veggie", name: it.name });
                  else if (it?.type === "gym" && typeof it.name === "string") items.push({ type: "gym", name: it.name });
                }
              }
              slots[i] = { items };
            }
            log[date] = slots;
          }
        }
        const nutrition: Nutrition = {};
        if (d.nutrition && typeof d.nutrition === "object") {
          for (const [k, v] of Object.entries(d.nutrition) as [string, any][]) {
            if (!v) continue;
            const mm: Macros = {
              protein: Number(v.protein) || 0,
              fat: Number(v.fat) || 0,
              carb: Number(v.carb) || 0,
              energy: Number(v.energy) || 0,
            };
            if (Number.isFinite(Number(v.portion))) mm.portion = Number(v.portion);
            if (Number.isFinite(Number(v.yield))) mm.yield = Number(v.yield);
            if (Number.isFinite(Number(v.gi))) mm.gi = Number(v.gi);
            if (v.data_source === "afcd" || v.data_source === "llm") mm.data_source = v.data_source;
            nutrition[k] = mm;
          }
        }
        setData({
          meals,
          snacks: d.snacks ?? "",
          veggies: d.veggies ?? "",
          gym: d.gym ?? "",
          week,
          log,
          nutrition,
        });
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }, 250);
  }, [data, loaded]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="app-title">app</div>
        <div style={{ width: 16 }} />
        <button className="tab active">home</button>
        <div className="spacer" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
