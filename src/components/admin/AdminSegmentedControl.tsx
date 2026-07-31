"use client";

import { adminChromeClusterClass } from "@/components/admin/AdminChrome";

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
};

/**
 * One frosted pill = one decision group (status vs visibility stay separate).
 */
export function AdminSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={adminChromeClusterClass}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-50 sm:px-3 sm:text-[13px] ${
              selected
                ? "bg-sea text-white shadow-sm"
                : "text-ink-muted hover:bg-white/70 hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
