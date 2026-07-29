export default function TripLoading() {
  return (
    <div
      className="min-h-screen bg-sand-50 pb-20"
      role="status"
      aria-label="Loading trip"
    >
      <section className="border-b border-sand-200/60 bg-sand-100/70">
        <div className="mx-auto max-w-7xl px-5 pt-14 pb-9 sm:px-8 sm:pt-16 xl:px-10">
          <div className="h-3 w-36 rounded-full bg-sand-200" />
          <div className="mt-4 h-11 w-full max-w-md rounded-2xl bg-sand-200/90 sm:h-14" />
          <div className="mt-3 h-5 w-full max-w-xl rounded-full bg-sand-200/70" />
          <div className="mt-6 flex gap-2">
            <div className="h-8 w-32 rounded-full bg-white/80" />
            <div className="h-8 w-20 rounded-full bg-white/80" />
          </div>
        </div>
      </section>

      <div className="border-b border-sand-200/70 bg-sand-50 px-5 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl gap-2">
          <div className="h-8 w-20 rounded-full bg-sand-200" />
          <div className="h-8 w-24 rounded-full bg-sand-100" />
          <div className="h-8 w-20 rounded-full bg-sand-100" />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 pt-10 sm:px-8 lg:grid-cols-[1.4fr_0.8fr] xl:px-10">
        <div className="h-72 rounded-3xl border border-sand-200/70 bg-white/65" />
        <div className="h-72 rounded-3xl border border-sand-200/70 bg-white/45" />
      </div>
      <span className="sr-only">Loading trip details…</span>
    </div>
  );
}
