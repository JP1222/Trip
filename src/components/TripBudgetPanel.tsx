"use client";

import { useMemo, useState } from "react";
import {
  BUDGET_CATEGORIES,
  budgetByCategory,
  budgetHeadcount,
  budgetItemGroupAmount,
  budgetItemSplitMode,
  budgetPaidByTotals,
  budgetPerPerson,
  budgetProgressPct,
  budgetRemaining,
  budgetSettlements,
  budgetTotal,
  formatMoney,
  newBudgetItemId,
} from "@/lib/budget";
import type {
  BudgetAmountMode,
  BudgetItem,
  BudgetSplitMode,
  TripBudget,
} from "@/lib/types";

type Props = {
  budget?: TripBudget;
  /** Trip travelers — per-person avg, payer strip, Paid by picker */
  members?: string[];
  editable?: boolean;
  onChange?: (budget: TripBudget) => void;
  /** Compact card (denser list) */
  compact?: boolean;
};

const CATEGORY_BAR: Record<string, string> = {
  stay: "bg-[#c4b8a0]",
  food: "bg-coral",
  transport: "bg-sea",
  activity: "bg-sea-soft",
  other: "bg-ink-muted",
};

const CATEGORY_DOT: Record<string, string> = {
  stay: "bg-[#c4b8a0]",
  food: "bg-coral",
  transport: "bg-sea",
  activity: "bg-sea-soft",
  other: "bg-ink-muted",
};

/**
 * Group budget dashboard — full-width workspace with an internal split:
 * overview (paid / settle / categories) | ledger + add form.
 */
export function TripBudgetPanel({
  budget,
  members = [],
  editable = false,
  onChange,
  compact = false,
}: Props) {
  const data: TripBudget = budget ?? { currency: "USD", items: [] };
  const headcount = budgetHeadcount(members.length);
  const total = budgetTotal(data, members.length);
  const limit =
    data.limit != null && Number.isFinite(data.limit) && data.limit > 0
      ? data.limit
      : undefined;
  const remaining = budgetRemaining(total, limit);
  const pct = budgetProgressPct(total, limit);
  const barPct = pct != null ? Math.min(100, pct) : null;
  const over = remaining != null && remaining < 0;
  const perPerson = budgetPerPerson(total, members.length);

  const [draftLabel, setDraftLabel] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftMode, setDraftMode] = useState<BudgetAmountMode>("total");
  const [draftSplit, setDraftSplit] = useState<BudgetSplitMode>("equal");
  const [draftCat, setDraftCat] = useState("other");
  const [draftWho, setDraftWho] = useState("");

  const byCat = useMemo(
    () => budgetByCategory(data.items, members.length),
    [data.items, members.length],
  );

  const payerTotals = useMemo(
    () => budgetPaidByTotals(data.items, members),
    [data.items, members],
  );

  const settlements = useMemo(
    () => budgetSettlements(data.items, members),
    [data.items, members],
  );

  const canSplit = members.length >= 2;

  const unassigned = useMemo(() => {
    return data.items.reduce((s, it) => {
      if (it.paidBy?.trim()) return s;
      return s + budgetItemGroupAmount(it, members.length);
    }, 0);
  }, [data.items, members.length]);

  const showPayers = payerTotals.length > 0;
  const showOverview =
    showPayers || settlements.length > 0 || byCat.length > 0;

  const paidByOptions = useMemo(() => {
    const names = [...members];
    for (const it of data.items) {
      const who = it.paidBy?.trim();
      if (who && !names.includes(who)) names.push(who);
    }
    if (draftWho.trim() && !names.includes(draftWho.trim())) {
      names.push(draftWho.trim());
    }
    return names;
  }, [members, data.items, draftWho]);

  const fieldClass =
    "w-full rounded-xl border border-sand-200 bg-sand-50/80 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted/60 focus:border-sea/40 focus:ring-2 focus:ring-sea/10";

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
      amountMode: draftMode === "each" ? "each" : undefined,
      splitMode: canSplit && draftSplit === "none" ? "none" : undefined,
      category: draftCat,
      paidBy: draftWho.trim() || undefined,
    };
    emit({
      ...data,
      items: [...data.items, item],
    });
    setDraftLabel("");
    setDraftAmount("");
    setDraftMode("total");
    setDraftSplit("equal");
    setDraftWho("");
  }

  function removeItem(id: string) {
    emit({ ...data, items: data.items.filter((i) => i.id !== id) });
  }

  function setItemMode(id: string, mode: BudgetAmountMode) {
    emit({
      ...data,
      items: data.items.map((i) =>
        i.id === id
          ? {
              ...i,
              amountMode: mode === "each" ? "each" : undefined,
            }
          : i,
      ),
    });
  }

  function setItemSplit(id: string, mode: BudgetSplitMode) {
    emit({
      ...data,
      items: data.items.map((i) =>
        i.id === id
          ? {
              ...i,
              splitMode: mode === "none" ? "none" : undefined,
            }
          : i,
      ),
    });
  }

  function setItemAmount(id: string, raw: string) {
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return;
    emit({
      ...data,
      items: data.items.map((i) => (i.id === id ? { ...i, amount } : i)),
    });
  }

  function setItemLabel(id: string, label: string) {
    emit({
      ...data,
      items: data.items.map((i) => (i.id === id ? { ...i, label } : i)),
    });
  }

  function setItemPaidBy(id: string, paidBy: string) {
    emit({
      ...data,
      items: data.items.map((i) =>
        i.id === id
          ? { ...i, paidBy: paidBy.trim() || undefined }
          : i,
      ),
    });
  }

  const overview = (
    <div className="space-y-5">
      {showPayers && (
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-ink-muted uppercase">
            Who paid
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {payerTotals.map((p) => (
              <li
                key={p.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-sand-200/80 bg-sand-50/80 px-2.5 py-1 text-xs text-ink-soft"
              >
                <span className="font-medium text-ink">{p.name}</span>
                <span className="tabular-nums text-ink-muted">
                  {formatMoney(p.amount, data.currency)}
                </span>
              </li>
            ))}
          </ul>
          {unassigned > 0 && (
            <p className="mt-2 text-[11px] text-ink-muted">
              {formatMoney(unassigned, data.currency)} not tagged with a payer
            </p>
          )}
        </div>
      )}

      {settlements.length > 0 && (
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-ink-muted uppercase">
            To settle
          </p>
          <ul className="mt-2 space-y-1.5">
            {settlements.map((t) => (
              <li
                key={`${t.from}-${t.to}-${t.amount}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <p className="min-w-0 text-ink-soft">
                  <span className="font-medium text-ink">{t.from}</span>
                  <span className="text-ink-muted"> → </span>
                  <span className="font-medium text-ink">{t.to}</span>
                </p>
                <span className="shrink-0 tabular-nums font-medium text-ink">
                  {formatMoney(t.amount, data.currency)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-muted">
            Equal split among {members.length} travelers
          </p>
        </div>
      )}

      {byCat.length > 0 && (
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] text-ink-muted uppercase">
            By category
          </p>
          <ul className="mt-2.5 space-y-2">
            {byCat.map((c) => {
              const share = total > 0 ? Math.round((c.amount / total) * 100) : 0;
              return (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-ink-soft">{c.label}</span>
                    <span className="tabular-nums text-ink-muted">
                      {formatMoney(c.amount, data.currency)}
                      <span className="ml-1.5 text-[10px]">{share}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand-100">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${
                        CATEGORY_BAR[c.id] || CATEGORY_BAR.other
                      }`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  const ledger = (
    <>
      <ul
        className={`divide-y divide-sand-100 ${
          compact ? "max-h-52 overflow-y-auto" : ""
        }`}
      >
        {data.items.length === 0 ? (
          <li className="px-4 py-8 text-center sm:px-5">
            <p className="font-serif text-base text-ink">No expenses yet</p>
            <p className="mt-1 text-xs text-ink-muted">
              {editable
                ? "Log lodging, food, tickets below."
                : "Nothing logged for this trip."}
            </p>
          </li>
        ) : (
          data.items.map((it) => {
            const catId = it.category || "other";
            const catLabel =
              BUDGET_CATEGORIES.find((c) => c.id === catId)?.label ||
              it.category ||
              "Other";
            const groupAmount = budgetItemGroupAmount(it, members.length);
            const isEach = it.amountMode === "each";
            const isSplit = budgetItemSplitMode(it) === "equal";
            return (
              <li key={it.id} className="px-4 py-3 text-sm sm:px-5">
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      CATEGORY_DOT[catId] || CATEGORY_DOT.other
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      {editable ? (
                        <input
                          value={it.label}
                          onChange={(e) => setItemLabel(it.id, e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-medium text-ink outline-none hover:border-sand-200 focus:border-sea/40 focus:bg-sand-50/80 focus:ring-2 focus:ring-sea/10"
                          aria-label="Expense name"
                        />
                      ) : (
                        <p className="min-w-0 font-medium text-ink">{it.label}</p>
                      )}
                      {editable ? (
                        <div className="shrink-0 text-right">
                          <div className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-sand-50/80 px-2 py-1 focus-within:border-sea/40 focus-within:ring-2 focus-within:ring-sea/10">
                            <span className="text-[11px] text-ink-muted">
                              {data.currency}
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={Number.isFinite(it.amount) ? it.amount : ""}
                              onChange={(e) =>
                                setItemAmount(it.id, e.target.value)
                              }
                              className="w-16 bg-transparent text-right text-sm font-medium tabular-nums text-ink outline-none"
                              aria-label={
                                isEach
                                  ? `Amount each for ${it.label}`
                                  : `Amount for ${it.label}`
                              }
                            />
                          </div>
                          {isEach && (
                            <p className="mt-0.5 text-[10px] tabular-nums text-ink-muted">
                              = {formatMoney(groupAmount, data.currency)} total
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="shrink-0 tabular-nums font-medium text-ink">
                          {formatMoney(groupAmount, data.currency)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {catLabel}
                      {isEach && !editable
                        ? ` · ${formatMoney(it.amount, data.currency)} each × ${headcount}`
                        : isEach
                          ? ` · each × ${headcount}`
                          : ""}
                      {!editable && it.paidBy ? ` · ${it.paidBy}` : ""}
                      {canSplit
                        ? isSplit
                          ? " · Split"
                          : " · Personal"
                        : ""}
                    </p>
                    {editable && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <div
                          className="inline-flex rounded-lg border border-sand-200 bg-white p-0.5"
                          role="group"
                          aria-label={`Amount type for ${it.label}`}
                        >
                          {(
                            [
                              ["total", "Total"],
                              ["each", "Each"],
                            ] as const
                          ).map(([mode, label]) => {
                            const active = isEach
                              ? mode === "each"
                              : mode === "total";
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setItemMode(it.id, mode)}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition ${
                                  active
                                    ? "bg-ink text-white"
                                    : "text-ink-muted hover:text-ink"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        {canSplit && (
                          <button
                            type="button"
                            onClick={() =>
                              setItemSplit(it.id, isSplit ? "none" : "equal")
                            }
                            className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium transition ${
                              isSplit
                                ? "border-sea/40 bg-sea/10 text-sea"
                                : "border-sand-200 bg-white text-ink-muted hover:text-ink"
                            }`}
                            aria-pressed={isSplit}
                          >
                            Split
                          </button>
                        )}
                        {paidByOptions.length > 0 && (
                          <select
                            value={it.paidBy || ""}
                            onChange={(e) =>
                              setItemPaidBy(it.id, e.target.value)
                            }
                            className="rounded-lg border border-sand-200 bg-white px-1.5 py-0.5 text-[10px] text-ink-muted outline-none focus:border-sea/40"
                            aria-label={`Paid by for ${it.label}`}
                          >
                            <option value="">Paid by</option>
                            {paidByOptions.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          className="ml-auto text-[11px] text-coral hover:underline"
                          aria-label={`Remove ${it.label}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {editable && (
        <div className="space-y-3 border-t border-sand-200/70 bg-sand-50/40 px-4 py-4 sm:px-5">
          <p className="text-[10px] font-medium tracking-[0.14em] text-ink-muted uppercase">
            Add expense
          </p>
          <div className="space-y-2">
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="What did you pay for?"
              className={fieldClass}
            />
            <div className="flex items-stretch gap-2">
              <input
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                placeholder={
                  draftMode === "each" ? "Price each" : "Total amount"
                }
                inputMode="decimal"
                className={`min-w-0 flex-1 ${fieldClass}`}
              />
              <div
                className="inline-flex shrink-0 rounded-xl border border-sand-200 bg-white p-0.5"
                role="group"
                aria-label="Amount type"
              >
                {(
                  [
                    ["total", "Total"],
                    ["each", "Each"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDraftMode(mode)}
                    className={`rounded-[0.625rem] px-2.5 py-1.5 text-xs font-medium transition ${
                      draftMode === mode
                        ? "bg-ink text-white"
                        : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {draftMode === "each" && (
              <p className="text-[11px] text-ink-muted">
                {draftAmount && Number.isFinite(Number(draftAmount))
                  ? `${formatMoney(Number(draftAmount), data.currency)} × ${headcount} = ${formatMoney(
                      Number(draftAmount) * headcount,
                      data.currency,
                    )}`
                  : `× ${headcount} travelers`}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={draftCat}
                onChange={(e) => setDraftCat(e.target.value)}
                className={fieldClass}
              >
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {paidByOptions.length > 0 ? (
                <select
                  value={draftWho}
                  onChange={(e) => setDraftWho(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Paid by</option>
                  {paidByOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={draftWho}
                  onChange={(e) => setDraftWho(e.target.value)}
                  placeholder="Paid by"
                  className={fieldClass}
                />
              )}
            </div>
            {canSplit && (
              <button
                type="button"
                onClick={() =>
                  setDraftSplit(draftSplit === "equal" ? "none" : "equal")
                }
                className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                  draftSplit === "equal"
                    ? "border-sea/40 bg-sea/10 text-sea"
                    : "border-sand-200 bg-white text-ink-muted hover:text-ink"
                }`}
                aria-pressed={draftSplit === "equal"}
              >
                <span className="font-medium">
                  {draftSplit === "equal" ? "Split equally" : "Personal"}
                </span>
                <span className="mt-0.5 block text-[11px] opacity-80">
                  {draftSplit === "equal"
                    ? draftWho.trim()
                      ? `${draftWho.trim()} gets repaid by the group`
                      : "AA among travelers — set Paid by to settle"
                    : "Won’t appear in To settle"}
                </span>
              </button>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={addItem}
              className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-white transition hover:bg-ink-soft"
            >
              Add expense
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      className={`w-full overflow-hidden rounded-3xl border border-sand-200/80 bg-white/70 ${
        compact ? "max-w-md shadow-[0_8px_30px_rgba(42,38,34,0.04)]" : ""
      }`}
    >
      {/* —— Hero —— */}
      <div className="border-b border-sand-200/70 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h3 className="font-serif text-xl text-ink sm:text-2xl">Budget</h3>
            {perPerson != null && (
              <p className="mt-0.5 text-xs text-ink-muted">
                {formatMoney(perPerson, data.currency)} each ·{" "}
                {members.length} travelers
              </p>
            )}
          </div>
          <div className="text-right">
            <p
              className={`font-serif text-2xl tabular-nums tracking-tight sm:text-3xl ${
                over ? "text-coral" : "text-ink"
              }`}
            >
              {formatMoney(total, data.currency)}
            </p>
            {limit != null ? (
              <p className="mt-0.5 text-xs text-ink-muted">
                of {formatMoney(limit, data.currency)}
                {remaining != null && (
                  <>
                    {" · "}
                    <span className={over ? "font-medium text-coral" : ""}>
                      {over
                        ? `${formatMoney(Math.abs(remaining), data.currency)} over`
                        : `${formatMoney(remaining, data.currency)} left`}
                    </span>
                  </>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-ink-muted">
                {data.items.length === 0
                  ? "No cap set"
                  : `${data.items.length} ${data.items.length === 1 ? "expense" : "expenses"}`}
              </p>
            )}
          </div>
        </div>

        {barPct != null && (
          <div className="mt-4 max-w-xl">
            <div className="h-2.5 overflow-hidden rounded-full bg-sand-100">
              <div
                className={`h-full rounded-full transition-[width,background-color] duration-300 ${
                  over
                    ? "bg-coral"
                    : pct != null && pct >= 85
                      ? "bg-coral-soft"
                      : "bg-sea"
                }`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] tabular-nums text-ink-muted">
              {pct}% of trip budget
            </p>
          </div>
        )}

        {editable && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-sand-100 pt-3">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              Cap
              <input
                type="number"
                value={data.limit ?? ""}
                onChange={(e) =>
                  emit({
                    ...data,
                    limit: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="—"
                className="w-20 rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs text-ink outline-none focus:border-sea/40"
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
                className="w-14 rounded-lg border border-sand-200 bg-white px-2 py-1 text-xs uppercase text-ink outline-none focus:border-sea/40"
              />
            </label>
          </div>
        )}
      </div>

      {/* —— Body: stacked on small screens, overview | ledger on large —— */}
      {compact || !showOverview ? (
        <div>
          {showOverview && (
            <div className="border-b border-sand-200/70 px-4 py-4 sm:px-5">
              {overview}
            </div>
          )}
          {ledger}
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:items-stretch">
          <aside className="border-b border-sand-200/70 px-4 py-4 sm:px-5 lg:border-r lg:border-b-0 lg:bg-sand-50/40">
            {overview}
          </aside>
          <div className="min-w-0">{ledger}</div>
        </div>
      )}
    </div>
  );
}
