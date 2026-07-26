import type { MemoryOverview as Overview } from "@/lib/memory-types";
import type { LoadState } from "./use-memory-dashboard";

type MemoryOverviewProps = {
  state: LoadState<Overview>;
  sourceCount: number;
};

export function MemoryOverview({
  state,
  sourceCount
}: MemoryOverviewProps) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <section
        className="memory-overview memory-overview-loading"
        aria-label="Memory overview"
        aria-busy="true"
      >
        <p role="status">Loading memory overview…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        className="memory-overview memory-overview-error"
        aria-label="Memory overview"
      >
        <div className="cv-alert cv-alert-warning">
          <strong className="cv-alert-title">Overview unavailable</strong>
          <span className="cv-alert-copy">
            Browse remains available when the memory list can still connect.
          </span>
        </div>
      </section>
    );
  }

  const overview = state.data;
  const verificationAvailable = overview.capabilities.verification;
  const verifiedPercent =
    overview.totals.entries > 0
      ? Math.round((overview.totals.verified / overview.totals.entries) * 100)
      : 0;

  return (
    <section className="memory-overview" aria-labelledby="memory-overview-title">
      <div className="memory-section-heading">
        <div>
          <p className="cv-eyebrow">At a glance</p>
          <h2 id="memory-overview-title">Memory overview</h2>
        </div>
        <span className="memory-overview-generated">
          Snapshot {formatTime(overview.generatedAt)}
        </span>
      </div>

      <div className="memory-overview-grid">
        <article className="memory-stat">
          <span className="memory-stat-label">Memories</span>
          <strong className="memory-stat-value">{overview.totals.entries}</strong>
          <span className="memory-stat-note">
            {sourceCount} {sourceCount === 1 ? "source" : "sources"}
          </span>
        </article>
        <article className="memory-stat">
          <span className="memory-stat-label">Familiars</span>
          <strong className="memory-stat-value">
            {overview.totals.familiars}
          </strong>
          <span className="memory-stat-note">Contributing memory</span>
        </article>
        <article className="memory-stat">
          <span className="memory-stat-label">Verification</span>
          {verificationAvailable ? (
            <>
              <strong className="memory-stat-value">{verifiedPercent}%</strong>
              <span className="memory-stat-note">
                {verifiedPercent}% verified
              </span>
            </>
          ) : (
            <>
              <strong className="memory-stat-value memory-stat-unavailable">
                Unavailable
              </strong>
              <span className="memory-stat-note">
                Verification unavailable
              </span>
            </>
          )}
        </article>
        <article className="memory-stat">
          <span className="memory-stat-label">Attention</span>
          {verificationAvailable ? (
            <>
              <strong className="memory-stat-value">
                {overview.totals.needsReview}
              </strong>
              <span className="memory-stat-note">
                {overview.totals.needsReview} need review
              </span>
            </>
          ) : (
            <>
              <strong className="memory-stat-value memory-stat-unavailable">
                —
              </strong>
              <span className="memory-stat-note">Review state unavailable</span>
            </>
          )}
        </article>
      </div>

      <details className="memory-system-checks">
        <summary>System checks</summary>
        <dl className="memory-check-grid">
          <div>
            <dt>Manifest</dt>
            <dd>{overview.verification.manifest ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Index</dt>
            <dd>{overview.verification.index ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Checked</dt>
            <dd>{formatTime(overview.verification.checkedAt)}</dd>
          </div>
        </dl>
        {overview.verification.issues.length > 0 ? (
          <ul className="memory-check-issues">
            {overview.verification.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className="memory-muted">
            {verificationAvailable
              ? "No verification issues reported."
              : "Verification diagnostics are not supplied by this daemon."}
          </p>
        )}
      </details>
    </section>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
}
