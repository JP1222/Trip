import type { BudgetItem, TripBudget } from "./types";

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

export function budgetTotal(budget?: TripBudget | null): number {
  if (!budget?.items?.length) return 0;
  return budget.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
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
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
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
          return {
            id: String(it.id || `b-${Math.random().toString(36).slice(2, 8)}`),
            label,
            amount,
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
