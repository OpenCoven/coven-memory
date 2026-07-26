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
        <span className="memory-overview-dot memory-overview-dot-waiting" />
        <p role="status">Loading overview…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        className="memory-overview memory-overview-error"
        aria-label="Memory overview"
      >
        <span className="memory-overview-dot memory-overview-dot-warning" />
        <div>
          <strong>Overview unavailable</strong>
          <p>Memory browsing remains available.</p>
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
    <details className="memory-overview">
      <summary>
        <span
          className={`memory-overview-dot memory-overview-dot-${overview.verification.state}`}
          aria-hidden="true"
        />
        <span>
          <strong>Memory overview</strong>
          <small>
            <span>{overview.totals.entries} entries</span>
            <span aria-hidden="true"> · </span>
            <span>
              {sourceCount} {sourceCount === 1 ? "source" : "sources"}
            </span>
          </small>
        </span>
        <span className="memory-overview-caret" aria-hidden="true">
          ⌃
        </span>
      </summary>

      <div className="memory-overview-body">
        <div className="memory-overview-stats">
          <OverviewStat label="Memories" value={overview.totals.entries} />
          <OverviewStat label="Familiars" value={overview.totals.familiars} />
          <OverviewStat
            label="Verification"
            value={
              verificationAvailable
                ? `${verifiedPercent}% verified`
                : "Verification unavailable"
            }
          />
          <OverviewStat
            label="Attention"
            value={
              verificationAvailable
                ? `${overview.totals.needsReview} need review`
                : "Review state unavailable"
            }
          />
        </div>

        <dl className="memory-system-checks">
          <div>
            <dt>Manifest</dt>
            <dd>{overview.verification.manifest ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Index</dt>
            <dd>{overview.verification.index ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Snapshot</dt>
            <dd>{formatTime(overview.generatedAt)}</dd>
          </div>
        </dl>

        {overview.verification.issues.length > 0 ? (
          <ul className="memory-check-issues">
            {overview.verification.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

function OverviewStat({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
