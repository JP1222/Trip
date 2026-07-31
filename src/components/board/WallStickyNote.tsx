"use client";

import { useEffect, useRef, useState } from "react";
import { parseStickyNoteLabel } from "@/lib/sticky-note";

type Props = {
  label: string;
  /** Admin: show textarea instead of static text */
  editing?: boolean;
  onEditStart?: () => void;
  onSave?: (label: string) => void;
  onCancel?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Cork sticky — same look as the old wall-note pins / article notes.
 * Board widgets and the photo-grid both use this so edit + public match.
 */
export function WallStickyNote({
  label,
  editing = false,
  onEditStart,
  onSave,
  onCancel,
  className = "",
  style,
}: Props) {
  const { title, lines, signature } = parseStickyNoteLabel(label);
  const [draft, setDraft] = useState(label);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(label);
      requestAnimationFrame(() => {
        areaRef.current?.focus();
        areaRef.current?.select();
      });
    }
  }, [editing, label]);

  function commit() {
    const next = draft.replace(/\r\n/g, "\n").trim();
    if (!next) {
      onCancel?.();
      return;
    }
    onSave?.(next.slice(0, 2000));
  }

  return (
    <div
      className={`wall-note wall-note--board ${className}`.trim()}
      style={style}
      onClick={(e) => {
        if (editing) e.stopPropagation();
        else if (onEditStart) {
          e.stopPropagation();
          onEditStart();
        }
      }}
    >
      <span className="wall-note__pin" aria-hidden />
      {editing ? (
        <div className="wall-note__editor">
          <textarea
            ref={areaRef}
            className="wall-note__textarea"
            value={draft}
            rows={8}
            maxLength={2000}
            spellCheck
            aria-label="Sticky note text"
            placeholder={"Title\nline\n---\nsignature"}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                onCancel?.();
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
          />
          <div className="wall-note__editor-actions">
            <button
              type="button"
              className="wall-note__editor-btn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCancel?.();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="wall-note__editor-btn wall-note__editor-btn--save"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                commit();
              }}
            >
              Save
            </button>
          </div>
          <p className="wall-note__editor-hint">
            First line = title · <code>---</code> then signature · ⌘↵ save
          </p>
        </div>
      ) : (
        <>
          <p className="wall-note__title">{title}</p>
          {lines.map((line) => (
            <p key={line} className="wall-note__line">
              {line}
            </p>
          ))}
          {signature ? (
            <p className="wall-note__signature">{signature}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
