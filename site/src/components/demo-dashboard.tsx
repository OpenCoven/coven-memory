"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_MEMORIES,
  DEMO_OVERVIEW,
  filterDemoMemories,
  type DemoMemory,
  type DemoVerification
} from "../lib/demo-memories";

export function DemoDashboard() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<DemoMemory["id"]>(
    DEMO_MEMORIES[0].id
  );
  const [revealed, setRevealed] = useState(false);
  const [narrowPane, setNarrowPane] = useState<"index" | "reader">("index");
  const focusIntent = useRef<"index" | "reader" | null>(null);
  const readerHeadingRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef(new Map<DemoMemory["id"], HTMLButtonElement>());
  const entries = useMemo(
    () => filterDemoMemories(DEMO_MEMORIES, query),
    [query]
  );
  const selected =
    DEMO_MEMORIES.find((memory) => memory.id === selectedId) ??
    DEMO_MEMORIES[0];

  useEffect(() => {
    if (focusIntent.current === "reader" && narrowPane === "reader") {
      readerHeadingRef.current?.focus();
      focusIntent.current = null;
    } else if (focusIntent.current === "index" && narrowPane === "index") {
      rowRefs.current.get(selectedId)?.focus();
      focusIntent.current = null;
    }
  }, [narrowPane, selectedId]);

  const select = (memory: DemoMemory) => {
    focusIntent.current = "reader";
    setSelectedId(memory.id);
    setRevealed(false);
    setNarrowPane("reader");
  };

  const showIndex = () => {
    focusIntent.current = "index";
    setNarrowPane("index");
  };

  return (
    <div className="demo-shell" data-narrow-pane={narrowPane}>
      <header className="demo-header">
        <div className="demo-brand">
          <span className="demo-brand-mark" aria-hidden="true">
            ◇
          </span>
          <div>
            <span className="utility-label">Coven Memory</span>
            <strong>Memory</strong>
          </div>
        </div>

        <label className="demo-search">
          <span className="sr-only">Search synthetic memories</span>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            placeholder="Search fictional memories"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setNarrowPane("index");
            }}
          />
        </label>

        <div className="synthetic-veil">
          <span aria-hidden="true">◆</span>
          <span>Synthetic demo data</span>
        </div>
      </header>

      <div className="demo-workspace">
        <aside className="demo-library" aria-label="Library">
          <div>
            <span className="utility-label">Library</span>
            <h3>All memory</h3>
            <p>Four fictional records across three imagined familiars.</p>
          </div>

          <dl className="demo-overview">
            <div>
              <dt>Memories</dt>
              <dd>{DEMO_OVERVIEW.entries}</dd>
            </div>
            <div>
              <dt>Familiars</dt>
              <dd>{DEMO_OVERVIEW.familiars}</dd>
            </div>
            <div>
              <dt>Verified</dt>
              <dd>{DEMO_OVERVIEW.verified}</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>{DEMO_OVERVIEW.needsReview}</dd>
            </div>
          </dl>

          <div className="demo-boundary-note">
            <span aria-hidden="true">◇</span>
            <p>
              Nothing here came from a person, machine, daemon, or account.
            </p>
          </div>
        </aside>

        <section className="demo-index" aria-label="Memory index">
          <div className="demo-pane-heading">
            <h3>Memory index</h3>
            <span>
              {entries.length === DEMO_MEMORIES.length
                ? `${entries.length} memories`
                : `${entries.length} of ${DEMO_MEMORIES.length} memories`}
            </span>
          </div>

          {entries.length ? (
            <ul className="demo-memory-list">
              {entries.map((memory) => (
                <li key={memory.id}>
                  <button
                    type="button"
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(memory.id, node);
                      } else {
                        rowRefs.current.delete(memory.id);
                      }
                    }}
                    aria-current={
                      memory.id === selected.id ? "true" : undefined
                    }
                    onClick={() => select(memory)}
                  >
                    <span className="demo-row-topline">
                      <strong>{memory.title}</strong>
                      <span>{memory.relativeUpdatedAt}</span>
                    </span>
                    <span className="demo-row-meta">
                      {memory.familiar} · {memory.source}
                    </span>
                    <span className="demo-row-excerpt">
                      {memory.revealRequired
                        ? "Preview hidden"
                        : memory.excerpt}
                    </span>
                    <span className="demo-row-status">
                      <span
                        className={`state-dot state-${memory.verification}`}
                        aria-hidden="true"
                      />
                      {verificationLabel(memory.verification)}
                      {memory.revealRequired ? (
                        <span className="protected-chip">Protected</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="demo-empty">
              <strong>No fictional memories match.</strong>
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </section>

        <article className="demo-reader" aria-label="Memory reader">
          <button
            type="button"
            className="demo-back"
            onClick={showIndex}
          >
            ← Back to index
          </button>
          <div className="demo-reader-kicker">
            <span>{selected.source}</span>
            <span aria-hidden="true">·</span>
            <span>{verificationLabel(selected.verification)}</span>
          </div>
          <h2 ref={readerHeadingRef} tabIndex={-1}>
            {selected.title}
          </h2>
          <p className="demo-reader-meta">
            Familiar {selected.familiar} · Updated {selected.relativeUpdatedAt}
          </p>

          {selected.revealRequired && !revealed ? (
            <div className="demo-reveal">
              <span className="reveal-mark" aria-hidden="true">
                ◇
              </span>
              <div>
                <h3>Content hidden in the demo</h3>
                <p>
                  Protected examples require an explicit reveal, just like the
                  genuine dashboard.
                </p>
                <button type="button" onClick={() => setRevealed(true)}>
                  Reveal synthetic content
                </button>
              </div>
            </div>
          ) : (
            <div className="demo-reader-body">
              {selected.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          )}

          <footer className="demo-reader-footer">
            <span>Privacy · {selected.privacy}</span>
            <span>Source · fictional fixture</span>
          </footer>
        </article>
      </div>
    </div>
  );
}

function verificationLabel(state: DemoVerification) {
  switch (state) {
    case "verified":
      return "Verified";
    case "needs-review":
      return "Needs review";
    default:
      return "Unknown";
  }
}
