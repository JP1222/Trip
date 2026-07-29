import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-28 text-center">
      <p className="text-5xl" aria-hidden>
        🧭
      </p>
      <h1 className="mt-6 font-serif text-3xl text-ink">No trip here</h1>
      <p className="mt-3 text-sm text-ink-muted">
        The link may be wrong, or this journey has not been added yet.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-sea px-6 py-3 text-sm text-white transition hover:bg-sea-soft"
      >
        Back to home
      </Link>
    </div>
  );
}
