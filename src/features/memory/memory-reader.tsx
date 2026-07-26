"use client";

import { useState } from "react";
import type { Ref } from "react";
import type { MemoryDetail, MemoryOverview } from "@/lib/memory-types";
import type { LoadState } from "./use-memory-dashboard";
import { memoryRequiresReveal } from "./privacy";
import { MemoryMarkdown } from "./memory-markdown";
import { verificationLabel } from "./memory-list";

type MemoryReaderProps = {
  state: LoadState<MemoryDetail>;
  selectedId: string | null;
  capabilities?: MemoryOverview["capabilities"];
  focusRef?: Ref<HTMLElement>;
  titleRef?: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onRetry: () => void;
};

export function MemoryReader({ ...props }: MemoryReaderProps) {
  return (
    <MemoryReaderSelection
      key={props.selectedId ?? "no-selection"}
      {...props}
    />
  );
}

function MemoryReaderSelection({
  state,
  selectedId,
  capabilities,
  focusRef,
  titleRef,
  onBack,
  onRetry
}: MemoryReaderProps) {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [view, setView] = useState<"rendered" | "raw">("rendered");
  const shellProps = {
    ref: focusRef,
    className: "memory-reader-pane",
    tabIndex: -1,
    "aria-label": "Memory reader"
  } as const;

  if (!selectedId || state.status === "idle") {
    return (
      <section {...shellProps}>
        <ReaderBack onBack={onBack} />
        <div className="memory-reader-state">
          <span className="memory-reader-state-mark" aria-hidden="true">
            ◇
          </span>
          <p className="cv-eyebrow">Reader</p>
          <h2>Select a memory to read</h2>
          <p>
            Choose an entry from the index. Content remains hidden when privacy
            metadata is unknown.
          </p>
        </div>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section
        {...shellProps}
        aria-busy="true"
        aria-live="polite"
      >
        <ReaderBack onBack={onBack} />
        <div className="memory-reader-state">
          <span className="memory-skeleton memory-skeleton-title" />
          <span className="memory-skeleton memory-skeleton-copy" />
          <p role="status">Loading memory…</p>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section {...shellProps}>
        <ReaderBack onBack={onBack} />
        <div className="memory-reader-state">
          <span className="memory-reader-state-mark" aria-hidden="true">
            !
          </span>
          <p className="cv-eyebrow">Reader unavailable</p>
          <h2>Couldn&apos;t open this memory</h2>
          <p>The index is still available. Retry this entry when ready.</p>
          <button
            type="button"
            className="cv-action cv-action-secondary"
            onClick={onRetry}
          >
            Retry memory detail
          </button>
        </div>
      </section>
    );
  }

  const detail = state.data;
  const requiresReveal = memoryRequiresReveal(detail.privacy);
  const revealed = !requiresReveal || revealedId === detail.id;
  const verification = verificationLabel(detail.verification.state);

  return (
    <section
      {...shellProps}
      aria-labelledby="reader-title"
    >
      <ReaderBack onBack={onBack} />
      <header className="memory-reader-header">
        <div className="memory-reader-title">
          <p className="cv-eyebrow">
            {detail.familiarId} · {detail.source.label}
          </p>
          <h2 id="reader-title" ref={titleRef} tabIndex={-1}>
            {detail.title}
          </h2>
          <p className="memory-reader-time">
            Updated {formatDate(detail.updatedAt)}
          </p>
        </div>
        <span
          className={`memory-verification-badge memory-verification-${detail.verification.state}`}
        >
          <span className="memory-status-mark" aria-hidden="true" />
          {verification}
        </span>
      </header>

      <div className="memory-reader-layout">
        <div className="memory-reader-content">
          {!revealed ? (
            <div
              className="memory-redaction"
              role="region"
              aria-label="Hidden content"
            >
              <div className="memory-redaction-glyph" aria-hidden="true">
                ◈
              </div>
              <p className="cv-eyebrow">Privacy check</p>
              <h3>Content hidden until you reveal it</h3>
              <p>
                {detail.privacy.reason ||
                  "This memory is sensitive or has no recognized privacy classification."}
              </p>
              <button
                type="button"
                className="cv-action cv-action-primary"
                onClick={() => setRevealedId(detail.id)}
              >
                Reveal memory content
              </button>
              <small>
                Reveal applies only to this memory in this session.
              </small>
            </div>
          ) : (
            <div className="memory-document">
              <div
                className="cv-segmented memory-view-toggle"
                role="group"
                aria-label="Content view"
              >
                <button
                  type="button"
                  className="cv-segmented-item memory-view-button"
                  data-active={view === "rendered"}
                  aria-pressed={view === "rendered"}
                  onClick={() => setView("rendered")}
                >
                  Rendered
                </button>
                <button
                  type="button"
                  className="cv-segmented-item memory-view-button"
                  data-active={view === "raw"}
                  aria-pressed={view === "raw"}
                  onClick={() => setView("raw")}
                >
                  Raw
                </button>
              </div>
              {view === "rendered" ? (
                <MemoryMarkdown
                  content={detail.content}
                  title={detail.title}
                />
              ) : (
                <pre className="memory-raw">
                  <code>{detail.content}</code>
                </pre>
              )}
            </div>
          )}
        </div>

        <aside className="memory-inspector" aria-label="Memory provenance">
          <div className="memory-inspector-heading">
            <span>Provenance</span>
            <span
              className={`memory-status-mark memory-status-${detail.verification.state}`}
              aria-hidden="true"
            />
          </div>

          <dl className="memory-provenance-list">
            <MetadataRow label="Source" value={detail.source.label} />
            <MetadataRow label="Familiar" value={detail.familiarId} />
            <MetadataRow
              label="Privacy"
              value={privacyLabel(detail.privacy.classification)}
            />
            <MetadataRow label="Verification" value={verification} />
          </dl>

          <section className="memory-inspector-section">
            <h3>Verification</h3>
            <p>
              <strong>{verification}.</strong> {detail.verification.reason}
            </p>
          </section>
          <section className="memory-inspector-section">
            <h3>Attestation</h3>
            <p>
              {capabilities?.attestationMetadata
                ? detail.attestationMetadata
                  ? metadataFieldLabel(detail.attestationMetadata.fieldCount)
                  : "No attestation metadata"
                : "Attestation unavailable"}
            </p>
          </section>
          <section className="memory-inspector-section">
            <h3>Supersession</h3>
            <p>
              {capabilities?.supersessionHistory
                ? supersessionLabel(detail)
                : "Supersession unavailable"}
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReaderBack({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      className="cv-action cv-action-ghost memory-reader-back"
      onClick={onBack}
    >
      <span aria-hidden="true">←</span>
      Back to memories
    </button>
  );
}

function privacyLabel(classification: string | null) {
  if (classification === "public") {
    return "Public";
  }
  if (classification === null) {
    return "Unclassified";
  }
  return "Protected";
}

function supersessionLabel(detail: MemoryDetail) {
  if (detail.supersession.supersededBy) {
    return `Superseded by ${detail.supersession.supersededBy}`;
  }
  if (detail.supersession.supersedes) {
    return `Supersedes ${detail.supersession.supersedes}`;
  }
  return "No supersession links";
}

function metadataFieldLabel(fieldCount: number) {
  return `${fieldCount} metadata ${
    fieldCount === 1 ? "field" : "fields"
  } available`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "at an unavailable time"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
}
