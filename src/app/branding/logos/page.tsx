import Link from "next/link";

export const dynamic = "force-static";

const CONCEPTS = [
  {
    id: "A",
    file: "concept-01-polaroid",
    title: "Polaroid pin",
    blurb: "Chosen — polaroid icon extracted (no text, no bg).",
    chosen: true,
  },
  {
    id: "B",
    file: "concept-02-route",
    title: "Route",
    blurb: "Two places, one path.",
    chosen: false,
  },
  {
    id: "C",
    file: "concept-03-cork-wall",
    title: "Cork wall",
    blurb: "Corkboard album vibe.",
    chosen: false,
  },
  {
    id: "D",
    file: "concept-04-script",
    title: "Script",
    blurb: "Handwritten diary.",
    chosen: false,
  },
  {
    id: "E",
    file: "concept-05-stamp",
    title: "Passport stamp",
    blurb: "Travel seal.",
    chosen: false,
  },
] as const;

export default function LogoPickerPage() {
  return (
    <div className="min-h-screen bg-sand-50 pb-20">
      <div className="mx-auto max-w-5xl px-5 pt-16 sm:px-8 sm:pt-20">
        <p className="text-xs tracking-[0.2em] text-ink-muted uppercase">
          Branding
        </p>
        <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
          Logo
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Official mark: polaroid icon only (no wordmark, transparent
          background) — derived from concept A.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-sea hover:underline"
        >
          ← Back to wall
        </Link>

        {/* Official logo hero */}
        <section className="mt-10 overflow-hidden rounded-3xl border border-sea/25 bg-white shadow-[0_8px_30px_rgba(42,38,34,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 px-5 py-4 sm:px-6">
            <div>
              <span className="mr-2 rounded-full bg-sea/15 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-sea uppercase">
                Official
              </span>
              <span className="font-serif text-xl text-ink">A · Polaroid pin</span>
            </div>
            <p className="text-xs text-ink-muted">/branding/logo.png</p>
          </div>
          <div className="grid items-center gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_200px] sm:p-8">
            <div className="flex items-center justify-center rounded-2xl bg-[linear-gradient(45deg,#e0d8cc_25%,transparent_25%,transparent_75%,#e0d8cc_75%),linear-gradient(45deg,#e0d8cc_25%,transparent_25%,transparent_75%,#e0d8cc_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/logo.png"
                alt="Our trips polaroid icon"
                className="mx-auto w-full max-w-xs object-contain drop-shadow-md"
              />
            </div>
            <div className="space-y-4 text-center sm:text-left">
              <div>
                <p className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
                  Header size
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/logo.png"
                  alt=""
                  className="mx-auto mt-2 h-12 w-12 object-contain sm:mx-0"
                />
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">
                Icon only — no title text, transparent background.
              </p>
            </div>
          </div>
        </section>

        <h2 className="mt-14 font-serif text-2xl text-ink">All concepts</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {CONCEPTS.map((c) => (
            <li
              key={c.id}
              className={`overflow-hidden rounded-3xl border bg-white shadow-[0_4px_20px_rgba(42,38,34,0.04)] ${
                c.chosen ? "border-sea/40 ring-1 ring-sea/20" : "border-sand-200"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-sand-100 px-4 py-3">
                <span className="font-medium text-ink">
                  <span className="mr-1.5 text-ink-muted">{c.id}</span>
                  {c.title}
                </span>
                {c.chosen && (
                  <span className="text-[11px] font-semibold text-sea">✓ in use</span>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/branding/logos/${c.file}.jpg`}
                alt={`Logo concept ${c.id}: ${c.title}`}
                className="w-full object-contain p-3"
              />
              <p className="px-4 pb-4 text-xs text-ink-muted">{c.blurb}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
