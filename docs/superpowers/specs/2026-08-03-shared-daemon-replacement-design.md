# Shared Daemon Replacement Design

## Goal

Move the Coven Memory dashboard from temporary daemon processes to the
installed shared Coven daemon without interrupting unrelated active sessions.

## Current State

- `~/.coven/coven.sock` is owned by the installed daemon and already serves the
  Phase 1 memory overview, list, and opaque-ID detail routes.
- The running installed daemon is Coven CLI 0.2.1.
- npm publishes Coven CLI package 0.2.3. Its macOS native binary identifies
  itself as the coordinated `0.2.3-recovery.2` build.
- An orphaned daemon launched from a deleted prepublish directory is still
  running independently of the default socket.

## Approach

1. Record the current default daemon PID, socket, API responses, and orphan PID.
2. Upgrade the globally installed `@opencoven/cli` package to 0.2.3.
3. Restart the shared daemon through `coven daemon restart`.
4. Require a new healthy daemon PID and a live default Unix socket.
5. Verify the Phase 1 overview, list, and detail contracts through the socket.
6. Launch the packaged dashboard against its default daemon configuration and
   exercise the real overview, list, and detail browser-facing routes.
7. Terminate only the orphan whose executable path is inside the deleted
   prepublish directory.
8. Re-run daemon and dashboard probes after cleanup.

## Safety and Failure Handling

- Do not stop either process before the CLI upgrade succeeds.
- Use the daemon management command rather than killing the shared daemon.
- If restart fails, run `coven daemon start` and preserve the orphan until the
  default socket is healthy again.
- Match the orphan by its exact PID and executable path; do not use name-based
  process termination.
- Do not expose the daemon beyond loopback or change its Host/Origin policy.
- Do not include memory content in logs, notes, or committed artifacts.

## Verification

Completion requires:

- the installed `@opencoven/cli` package metadata reports 0.2.3 and
  `coven --version` reports its coordinated recovery build;
- `coven daemon status` reports a running daemon on `~/.coven/coven.sock`;
- overview returns HTTP 200 and the Phase 1 capability object;
- list rows include opaque IDs, source, privacy, and verification fields;
- detail returns HTTP 200 for an opaque list ID with content and metadata;
- the packaged dashboard reads the same default socket successfully;
- the orphan process is gone while the shared daemon and dashboard probes
  remain healthy.
