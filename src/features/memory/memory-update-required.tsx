type MemoryUpdateRequiredProps = {
  onRetry: () => void;
};

export function MemoryUpdateRequired({
  onRetry
}: MemoryUpdateRequiredProps) {
  return (
    <section
      className="cv-pane memory-update-required"
      aria-labelledby="memory-update-required-title"
    >
      <p className="cv-eyebrow">Local daemon update required</p>
      <h2 id="memory-update-required-title">
        Update Coven to open this version of Memory
      </h2>
      <p>
        Your local daemon uses an older read contract. Update Coven, restart
        the daemon, then reload this dashboard.
      </p>
      <button
        type="button"
        className="cv-action cv-action-secondary"
        onClick={onRetry}
      >
        Check again
      </button>
    </section>
  );
}
