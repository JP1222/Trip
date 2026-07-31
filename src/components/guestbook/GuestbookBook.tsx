import Link from "next/link";

type Props = {
  /** Subtitle under “Guestbook” (count / CTA). */
  countLabel: string;
  /** Public wall — whole book is a link. */
  href?: string;
  className?: string;
};

/** Cork guestbook cover — free-placed as a board widget. */
export function GuestbookBook({ countLabel, href, className }: Props) {
  const classNames = ["guestbook-book", className].filter(Boolean).join(" ");
  const aria = `Guestbook. ${countLabel}`;

  const inner = (
    <>
      <span className="guestbook-book__pin" aria-hidden />
      <span className="guestbook-book__cover">
        <span className="guestbook-book__spine" aria-hidden />
        <span className="guestbook-book__title">Guestbook</span>
        <span className="guestbook-book__count">{countLabel}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classNames} aria-label={aria}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={classNames} aria-label={aria}>
      {inner}
    </div>
  );
}
