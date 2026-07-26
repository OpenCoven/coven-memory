import type { MemoryOverview as Overview } from "@/lib/memory-types";
import type { LoadState } from "./use-memory-dashboard";

type MemoryOverviewProps = {
  state: LoadState<Overview>;
  sourceCount: number | null;
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
  const metrics = getOverviewMetrics(overview, sourceCount);

  return (
    <section className="memory-overview" aria-labelledby="memory-overview-title">
      <div className="memory-section-heading">
        <div>
          <p className="cv-eyebrow memory-overview-eyebrow">
            At a glance
          </p>
          <h2 id="memory-overview-title">Memory overview</h2>
        </div>
        <span className="memory-overview-generated">
          Snapshot {formatTime(overview.generatedAt)}
        </span>
      </div>

      <div className="memory-overview-summary" aria-label="Memory summary">
        <strong>{metrics.memories}</strong>
        <span>{metrics.familiars}</span>
        <span>{metrics.sources}</span>
        <span>{metrics.verification}</span>
        <span>{metrics.review}</span>
      </div>
    </section>
  );
}

export function MemoryDiagnostics({
  overview,
  sourceCount
}: {
  overview: Overview;
  sourceCount: number | null;
}) {
  const metrics = getOverviewMetrics(overview, sourceCount);

  return (
    <details className="cv-expander memory-overview-details">
      <summary className="cv-expander-summary">System details</summary>
      <div className="cv-expander-body">
        <div className="memory-overview-grid">
          <article className="memory-stat">
            <span className="memory-stat-label">Memories</span>
            <strong className="memory-stat-value">
              {overview.totals.entries}
            </strong>
            <span className="memory-stat-note">{metrics.sources}</span>
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
            {metrics.verificationAvailable ? (
              <>
                <strong className="memory-stat-value">
                  {metrics.verifiedPercent}%
                </strong>
                <span className="memory-stat-note">
                  {metrics.verification}
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
            {metrics.verificationAvailable ? (
              <>
                <strong className="memory-stat-value">
                  {overview.totals.needsReview}
                </strong>
                <span className="memory-stat-note">{metrics.review}</span>
              </>
            ) : (
              <>
                <strong className="memory-stat-value memory-stat-unavailable">
                  —
                </strong>
                <span className="memory-stat-note">
                  Review state unavailable
                </span>
              </>
            )}
          </article>
        </div>

        <div className="memory-system-checks">
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
              {metrics.verificationAvailable
                ? "No verification issues reported."
                : "Verification diagnostics are not supplied by this daemon."}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

function getOverviewMetrics(overview: Overview, sourceCount: number | null) {
  const verificationAvailable = overview.capabilities.verification;
  const verifiedPercent =
    overview.totals.entries > 0
      ? Math.round((overview.totals.verified / overview.totals.entries) * 100)
      : 0;

  return {
    memories: formatCount(overview.totals.entries, "memory", "memories"),
    familiars: formatCount(overview.totals.familiars, "familiar", "familiars"),
    sources:
      sourceCount === null
        ? "Sources unavailable"
        : formatCount(sourceCount, "source", "sources"),
    verificationAvailable,
    verifiedPercent,
    verification: verificationAvailable
      ? `${verifiedPercent}% verified`
      : "Verification unavailable",
    review: verificationAvailable
      ? `${overview.totals.needsReview} ${
          overview.totals.needsReview === 1 ? "needs" : "need"
        } review`
      : "Review state unavailable"
  };
}

function formatCount(
  count: number,
  singular: string,
  plural: string
) {
  return `${count} ${count === 1 ? singular : plural}`;
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
