import { CopyCommand } from "../components/copy-command";
import { DemoDashboard } from "../components/demo-dashboard";

export default function HomePage() {
  return (
    <main>
      <section className="launcher" aria-labelledby="launcher-title">
        <nav className="launcher-nav" aria-label="Primary">
          <a className="wordmark" href="#top" aria-label="Coven Memory home">
            <span aria-hidden="true">◇</span>
            Coven Memory
          </a>
          <a href="#local">Open local memory</a>
        </nav>

        <div className="launcher-copy" id="top">
          <p className="utility-label">Local-first familiar memory</p>
          <h1 id="launcher-title">Memory stays with you.</h1>
          <p className="launcher-lede">
            Browse durable context, provenance, and verification through a
            dashboard that runs beside your local Coven daemon.
          </p>
          <div className="launcher-actions">
            <a className="primary-action" href="#demo">
              Open demo
            </a>
            <a className="text-action" href="#local">
              Open genuine local memory
            </a>
          </div>
        </div>

        <div className="launcher-boundary">
          <span className="boundary-diamond" aria-hidden="true">
            ◇
          </span>
          <div>
            <strong>Private by architecture</strong>
            <p>
              The public demo is static and fictional. Genuine memory never
              passes through this site.
            </p>
          </div>
        </div>
      </section>

      <section className="local-path" id="local" aria-labelledby="local-title">
        <div>
          <p className="utility-label">Your machine · your daemon</p>
          <h2 id="local-title">Open your own memory locally.</h2>
          <p>
            Install Coven, then launch the protected dashboard beside the
            daemon that owns your memory.
          </p>
        </div>
        <CopyCommand command="coven memory open" />
      </section>

      <section className="demo-section" id="demo" aria-labelledby="demo-title">
        <div className="demo-intro">
          <div>
            <p className="utility-label">Interactive synthetic preview</p>
            <h2 id="demo-title">A fictional memory workspace</h2>
          </div>
          <p>
            Search, select, and reveal made-up examples. No request leaves this
            exported page.
          </p>
        </div>
        <DemoDashboard />
      </section>
    </main>
  );
}
