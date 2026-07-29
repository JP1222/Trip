"use client";

import { useMemo, useState } from "react";
import {
  BUDGET_CATEGORIES,
  budgetTotal,
  formatMoney,
  newBudgetItemId,
} from "@/lib/budget";
import type { BudgetItem, TripBudget } from "@/lib/types";

type Props = {
  budget?: TripBudget;
  editable?: boolean;
  onChange?: (budget: TripBudget) => void;
  /** Compact card under map (desktop right column) */
  compact?: boolean;
};

/**
 * Group budget — view totals + optional edit (Wanderlog-style simple ledger).
 */
export function TripBudgetPanel({
  budget,
  editable = false,
  onChange,
  compact = false,
}: Props) {
  const data: TripBudget = budget ?? { currency: "USD", items: [] };
  const total = budgetTotal(data);
  const limit = data.limit;
  const over =
    limit != null && Number.isFinite(limit) && limit > 0 && total > limit;
  const pct =
    limit != null && limit > 0
      ? Math.min(100, Math.round((total / limit) * 100))
      : null;

  const [draftLabel, setDraftLabel] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftCat, setDraftCat] = useState("other");
  const [draftWho, setDraftWho] = useState("");

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of data.items) {
      const k = it.category || "other";
      map.set(k, (map.get(k) || 0) + it.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.items]);

  function emit(next: TripBudget) {
    onChange?.(next);
  }

  function addItem() {
    const amount = Number(draftAmount);
    const label = draftLabel.trim();
    if (!label || !Number.isFinite(amount) || amount === 0) return;
    const item: BudgetItem = {
      id: newBudgetItemId(),
      label,
      amount,
      category: draftCat,
      paidBy: draftWho.trim() || undefined,
    };
    emit({
      ...data,
      items: [...data.items, item],
    });
    setDraftLabel("");
    setDraftAmount("");
    setDraftWho("");
  }

  function removeItem(id: string) {
    emit({ ...data, items: data.items.filter((i) => i.id !== id) });
  }

  return (
    <div
      className={`overflow-hidden rounded-3xl border border-sand-200/80 bg-white/70 ${
        compact ? "shadow-[0_8px_30px_rgba(42,38,34,0.04)]" : ""
      }`}
    >
      <div className="border-b border-sand-200/70 px-4 py-3 sm:px-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg text-ink">Budget</h3>
          <p
            className={`text-sm font-semibold tabular-nums ${
              over ? "text-coral" : "text-ink"
            }`}
          >
            {formatMoney(total, data.currency)}
            {limit != null && limit > 0 && (
              <span className="font-normal text-ink-muted">
                {" "}
                / {formatMoney(limit, data.currency)}
              </span>
            )}
          </p>
        </div>
        {pct != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-100">
            <div
              className={`h-full rounded-full transition-all ${
                over ? "bg-coral" : "bg-sea"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {byCat.length > 0 && (
          <p className="mt-2 text-[11px] text-ink-muted">
            {byCat
              .slice(0, 4)
              .map(([c, a]) => {
                const lab =
                  BUDGET_CATEGORIES.find((x) => x.id === c)?.label || c;
                return `${lab} ${formatMoney(a, data.currency)}`;
              })
              .join(" · ")}
          </p>
        )}
      </div>

      <ul
        className={`divide-y divide-sand-100 ${
          compact ? "max-h-48 overflow-y-auto" : "max-h-none"
        }`}
      >
        {data.items.length === 0 ? (
          <li className="px-4 py-4 text-xs text-ink-muted sm:px-5">
            {editable
              ? "Add lodging, food, tickets…"
              : "No expenses logged yet."}
          </li>
        ) : (
          data.items.map((it) => (
            <li
              key={it.id}
              className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm sm:px-5"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{it.label}</p>
                <p className="text-[11px] text-ink-muted">
                  {BUDGET_CATEGORIES.find((c) => c.id === it.category)?.label ||
                    it.category ||
                    "Other"}
                  {it.paidBy ? ` · ${it.paidBy}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums text-ink-soft">
                  {formatMoney(it.amount, data.currency)}
                </span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="text-[11px] text-coral hover:underline"
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {editable && (
        <div className="space-y-2 border-t border-sand-200/70 px-4 py-3 sm:px-5">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="What"
              className="col-span-2 rounded-lg border border-sand-200 bg-sand-50/50 px-2.5 py-1.5 text-xs text-ink outline-none focus:border-sea/40"
            />
            <input
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value)}
              placeholder="Amount"
              inputMode="decimal"
              className="rounded-lg border border-sand-200 bg-sand-50/50 px-2.5 py-1.5 text-xs text-ink outline-none focus:border-sea/40"
            />
            <select
              value={draftCat}
              onChange={(e) => setDraftCat(e.target.value)}
              className="rounded-lg border border-sand-200 bg-sand-50/50 px-2 py-1.5 text-xs text-ink outline-none focus:border-sea/40"
            >
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              value={draftWho}
              onChange={(e) => setDraftWho(e.target.value)}
              placeholder="Paid by (optional)"
              className="col-span-2 rounded-lg border border-sand-200 bg-sand-50/50 px-2.5 py-1.5 text-xs text-ink outline-none focus:border-sea/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              Cap
              <input
                type="number"
                value={data.limit ?? ""}
                onChange={(e) =>
                  emit({
                    ...data,
                    limit: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
                placeholder="—"
                className="w-20 rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs text-ink outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              Currency
              <input
                value={data.currency}
                onChange={(e) =>
                  emit({
                    ...data,
                    currency: e.target.value.toUpperCase().slice(0, 3),
                  })
                }
                className="w-14 rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs uppercase text-ink outline-none"
              />
            </label>
            <button
              type="button"
              onClick={addItem}
              className="ml-auto rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-white hover:bg-ink-soft"
            >
              + Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
