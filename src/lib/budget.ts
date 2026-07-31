import type {
  BudgetAmountMode,
  BudgetItem,
  BudgetSplitMode,
  TripBudget,
} from "./types";

export const BUDGET_CATEGORIES = [
  { id: "stay", label: "Stay" },
  { id: "food", label: "Food" },
  { id: "transport", label: "Transit" },
  { id: "activity", label: "Activity" },
  { id: "other", label: "Other" },
] as const;

export function emptyBudget(currency = "USD"): TripBudget {
  return { currency, items: [] };
}

/** Travelers used when expanding "each" prices. At least 1. */
export function budgetHeadcount(memberCount: number): number {
  return Math.max(1, Math.floor(memberCount) || 1);
}

/**
 * Group cost for one line.
 * `each` → amount × headcount; `total` (default) → amount as-is.
 */
export function budgetItemGroupAmount(
  item: Pick<BudgetItem, "amount" | "amountMode">,
  memberCount: number,
): number {
  const amount = Number(item.amount) || 0;
  if (item.amountMode === "each") {
    return amount * budgetHeadcount(memberCount);
  }
  return amount;
}

export function budgetTotal(
  budget?: TripBudget | null,
  memberCount = 1,
): number {
  if (!budget?.items?.length) return 0;
  return budget.items.reduce(
    (s, it) => s + budgetItemGroupAmount(it, memberCount),
    0,
  );
}

/** Equal split of a total across travelers. Null when fewer than 2 people. */
export function budgetPerPerson(
  total: number,
  memberCount: number,
): number | null {
  if (!Number.isFinite(total) || memberCount < 2) return null;
  return total / memberCount;
}

/** Cap − spent. Null when no positive cap. Negative means over. */
export function budgetRemaining(
  total: number,
  limit?: number | null,
): number | null {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return null;
  if (!Number.isFinite(total)) return null;
  return limit - total;
}

/** Spent / cap as 0–100+ (can exceed 100 when over). Null without cap. */
export function budgetProgressPct(
  total: number,
  limit?: number | null,
): number | null {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return null;
  if (!Number.isFinite(total)) return null;
  return Math.round((total / limit) * 100);
}

export type BudgetCategoryTotal = { id: string; label: string; amount: number };

export function budgetByCategory(
  items: BudgetItem[] | undefined,
  memberCount = 1,
): BudgetCategoryTotal[] {
  if (!items?.length) return [];
  const map = new Map<string, number>();
  for (const it of items) {
    const k = it.category || "other";
    map.set(k, (map.get(k) || 0) + budgetItemGroupAmount(it, memberCount));
  }
  return [...map.entries()]
    .map(([id, amount]) => ({
      id,
      label: BUDGET_CATEGORIES.find((c) => c.id === id)?.label || id,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type BudgetPayerTotal = { name: string; amount: number };

/**
 * How much each person has fronted (from paidBy).
 * Only people who actually paid (> 0) — never invent $0 rows.
 * `members` only influences sort order (trip roster first).
 */
export function budgetPaidByTotals(
  items: BudgetItem[] | undefined,
  members: string[] = [],
): BudgetPayerTotal[] {
  const map = new Map<string, number>();
  const memberCount = members.length;
  for (const it of items ?? []) {
    const who = it.paidBy?.trim();
    if (!who) continue;
    map.set(
      who,
      (map.get(who) || 0) + budgetItemGroupAmount(it, memberCount),
    );
  }
  const memberIndex = new Map(
    members.map((n, i) => [n.trim(), i] as const).filter(([n]) => n),
  );
  return [...map.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => {
      const ai = memberIndex.get(a.name);
      const bi = memberIndex.get(b.name);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return b.amount - a.amount || a.name.localeCompare(b.name);
    });
}

export function formatMoney(
  amount: number,
  currency = "USD",
  locale = "en-US",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Effective split mode — omitted means equal AA. */
export function budgetItemSplitMode(
  item: Pick<BudgetItem, "splitMode">,
): BudgetSplitMode {
  return item.splitMode === "none" ? "none" : "equal";
}

export type BudgetSettlement = {
  from: string;
  to: string;
  amount: number;
};

/**
 * Equal-split settlements from expenses that have a payer.
 * Net balances → greedy transfers (Splitwise-lite, no multi-currency).
 */
export function budgetSettlements(
  items: BudgetItem[] | undefined,
  members: string[],
): BudgetSettlement[] {
  const people = [
    ...new Set(
      members.map((m) => m.trim()).filter(Boolean),
    ),
  ];
  if (people.length < 2 || !items?.length) return [];

  const net = new Map<string, number>(people.map((p) => [p, 0]));
  const n = people.length;

  for (const it of items) {
    if (budgetItemSplitMode(it) !== "equal") continue;
    const payer = it.paidBy?.trim();
    if (!payer || !net.has(payer)) continue;
    const cost = budgetItemGroupAmount(it, n);
    if (cost === 0) continue;
    const share = cost / n;
    for (const person of people) {
      net.set(person, (net.get(person) || 0) - share);
    }
    net.set(payer, (net.get(payer) || 0) + cost);
  }

  const debtors: { name: string; amount: number }[] = [];
  const creditors: { name: string; amount: number }[] = [];
  for (const [name, bal] of net) {
    // Ignore sub-cent noise
    if (bal < -0.005) debtors.push({ name, amount: -bal });
    else if (bal > 0.005) creditors.push({ name, amount: bal });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers: BudgetSettlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0.005) {
      transfers.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(pay * 100) / 100,
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= 0.005) i++;
    if (creditors[j].amount <= 0.005) j++;
  }
  return transfers;
}

function sanitizeAmountMode(raw: unknown): BudgetAmountMode {
  return raw === "each" ? "each" : "total";
}

function sanitizeSplitMode(raw: unknown): BudgetSplitMode {
  return raw === "none" ? "none" : "equal";
}

export function sanitizeBudget(
  raw: unknown,
): TripBudget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as TripBudget;
  const currency = String(b.currency || "USD").trim().toUpperCase() || "USD";
  const limit =
    b.limit != null && b.limit !== ("" as unknown)
      ? Number(b.limit)
      : undefined;
  const items: BudgetItem[] = Array.isArray(b.items)
    ? b.items
        .map((it) => {
          const amount = Number(it?.amount);
          const label = String(it?.label || "").trim();
          if (!label || !Number.isFinite(amount)) return null;
          const amountMode = sanitizeAmountMode(it?.amountMode);
          const splitMode = sanitizeSplitMode(it?.splitMode);
          return {
            id: String(it.id || `b-${Math.random().toString(36).slice(2, 8)}`),
            label,
            amount,
            amountMode: amountMode === "total" ? undefined : amountMode,
            // Persist "none"; omit default "equal" for cleaner JSON
            splitMode: splitMode === "equal" ? undefined : splitMode,
            category: it.category ? String(it.category) : undefined,
            paidBy: it.paidBy ? String(it.paidBy).trim() : undefined,
          };
        })
        .filter(Boolean) as BudgetItem[]
    : [];

  return {
    currency,
    limit: limit != null && Number.isFinite(limit) ? limit : undefined,
    items,
  };
}

export function newBudgetItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `b-${Date.now().toString(36)}`;
}
