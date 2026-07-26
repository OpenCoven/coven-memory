# Memory Dashboard Daemon API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe overview and full-detail memory reads to the Coven daemon so the standalone dashboard never reads memory files, indexes, manifests, or paths directly.

**Architecture:** Refactor the existing `scan_memory` filesystem walk into a private record collector, derive stable opaque IDs with UUID v5, and expose list, overview, and detail DTOs through the existing versioned daemon router. Phase 1 reports unsupported verification/privacy capabilities honestly instead of inventing metadata.

**Tech Stack:** Rust 2021, `coven-cli`, `serde`, `chrono`, `uuid`, existing daemon HTTP/Unix-socket API.

---

## Worktree setup

Run this plan in a dedicated `OpenCoven/coven` worktree:

```bash
cd path/to/coven
git fetch origin
git worktree add .worktrees/memory-dashboard-api -b feature/memory-dashboard-api origin/main
cd .worktrees/memory-dashboard-api
cargo test -p coven-cli scan_memory_ --locked
```

Expected baseline: the existing memory scan tests pass before any edits.

### Task 1: Refactor memory scanning into safe internal records

**Files:**
- Modify: `crates/coven-cli/src/cockpit_sources.rs:1-12`
- Modify: `crates/coven-cli/src/cockpit_sources.rs:318-387`
- Test: `crates/coven-cli/src/cockpit_sources.rs:880-913`

- [ ] **Step 1: Write failing tests for stable IDs, ISO timestamps, and symlink exclusion**

Add these tests beside the existing `scan_memory_*` tests:

```rust
#[test]
fn scan_memory_returns_stable_opaque_ids_and_iso_timestamps() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().join(MEMORY_DIR).join("sage");
    fs::create_dir_all(&root)?;
    fs::write(root.join("notes.md"), "# Notes\n\nDurable fact.")?;

    let first = scan_memory(temp.path())?;
    let second = scan_memory(temp.path())?;

    assert_eq!(first.len(), 1);
    assert_eq!(first[0].id, second[0].id);
    assert!(uuid::Uuid::parse_str(&first[0].id).is_ok());
    assert!(!first[0].id.contains("sage"));
    assert!(first[0].updated_at_iso.ends_with('Z'));
    assert_eq!(first[0].privacy_classification, None);
    assert_eq!(first[0].reveal_required, None);
    assert_eq!(first[0].verification_state, "unknown");
    Ok(())
}

#[cfg(unix)]
#[test]
fn scan_memory_skips_symlinked_markdown_files() -> Result<()> {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir()?;
    let root = temp.path().join(MEMORY_DIR).join("sage");
    fs::create_dir_all(&root)?;
    let outside = temp.path().join("outside.md");
    fs::write(&outside, "private outside content")?;
    symlink(&outside, root.join("leak.md"))?;

    assert!(scan_memory(temp.path())?.is_empty());
    Ok(())
}
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
cargo test -p coven-cli scan_memory_returns_stable_opaque_ids_and_iso_timestamps --locked -- --nocapture
cargo test -p coven-cli scan_memory_skips_symlinked_markdown_files --locked -- --nocapture
```

Expected: the first test fails because `updated_at_iso` does not exist and IDs are not UUIDs. The symlink test documents the required containment behavior.

- [ ] **Step 3: Add the private record collector and stable ID helper**

Add imports:

```rust
use chrono::{DateTime, SecondsFormat, Utc};
use uuid::Uuid;
```

Replace the memory DTO and scanner with:

```rust
const MEMORY_ID_NAMESPACE: Uuid =
    Uuid::from_u128(0x88f4_153f_221e_4f51_9346_7f59d9b28d57);

#[derive(Debug, Clone)]
struct MemoryRecord {
    id: String,
    familiar_id: String,
    title: String,
    relative_path: String,
    updated_at: String,
    updated_at_iso: String,
    body: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryFileDto {
    pub id: String,
    pub familiar_id: String,
    pub title: String,
    pub path: String,
    pub updated_at: String,
    pub updated_at_iso: String,
    pub excerpt: String,
    pub privacy_classification: Option<String>,
    pub reveal_required: Option<bool>,
    pub verification_state: String,
}

fn memory_id(relative_path: &str) -> String {
    Uuid::new_v5(&MEMORY_ID_NAMESPACE, relative_path.as_bytes()).to_string()
}

fn scan_memory_records(coven_home: &Path) -> Result<Vec<MemoryRecord>> {
    let root = coven_home.join(MEMORY_DIR);
    let familiar_dirs = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err).with_context(|| format!("failed to read {}", root.display())),
    };

    let canonical_root = root
        .canonicalize()
        .with_context(|| format!("failed to resolve {}", root.display()))?;
    let mut records = Vec::new();

    for familiar_entry in familiar_dirs {
        let familiar_entry = familiar_entry?;
        if !familiar_entry.file_type()?.is_dir() {
            continue;
        }
        let familiar_id = familiar_entry.file_name().to_string_lossy().into_owned();
        for file_entry in fs::read_dir(familiar_entry.path())? {
            let file_entry = file_entry?;
            if !file_entry.file_type()?.is_file() {
                continue;
            }
            let file_path = file_entry.path();
            if file_path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }
            let canonical_file = file_path
                .canonicalize()
                .with_context(|| format!("failed to resolve {}", file_path.display()))?;
            if !canonical_file.starts_with(&canonical_root) {
                continue;
            }

            let file_name = file_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("untitled.md")
                .to_string();
            let title = file_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("untitled")
                .to_string();
            let relative_path = format!("{familiar_id}/{file_name}");
            let modified = file_entry.metadata()?.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            let modified_utc: DateTime<Utc> = modified.into();

            records.push(MemoryRecord {
                id: memory_id(&relative_path),
                familiar_id: familiar_id.clone(),
                title,
                relative_path,
                updated_at: relative_time(modified),
                updated_at_iso: modified_utc.to_rfc3339_opts(SecondsFormat::Secs, true),
                body: fs::read_to_string(&canonical_file)
                    .with_context(|| format!("failed to read {}", canonical_file.display()))?,
            });
        }
    }

    records.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(records)
}

pub fn scan_memory(coven_home: &Path) -> Result<Vec<MemoryFileDto>> {
    Ok(scan_memory_records(coven_home)?
        .into_iter()
        .map(|record| MemoryFileDto {
            id: record.id,
            familiar_id: record.familiar_id,
            title: record.title,
            path: record.relative_path,
            updated_at: record.updated_at,
            updated_at_iso: record.updated_at_iso,
            excerpt: first_paragraph(&record.body, 200),
            privacy_classification: None,
            reveal_required: None,
            verification_state: "unknown".to_string(),
        })
        .collect())
}
```

- [ ] **Step 4: Run all memory scanner tests**

Run:

```bash
cargo test -p coven-cli scan_memory_ --locked -- --nocapture
```

Expected: all `scan_memory_*` tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/coven-cli/src/cockpit_sources.rs
git commit -m "refactor(memory): collect safe daemon memory records"
```

### Task 2: Add detail and overview domain DTOs

**Files:**
- Modify: `crates/coven-cli/src/cockpit_sources.rs:318-430`
- Test: `crates/coven-cli/src/cockpit_sources.rs`

- [ ] **Step 1: Write failing tests for detail and honest capability reporting**

Add:

```rust
#[test]
fn read_memory_detail_returns_content_without_a_filesystem_path() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().join(MEMORY_DIR).join("sage");
    fs::create_dir_all(&root)?;
    fs::write(root.join("notes.md"), "# Notes\n\nDurable fact.")?;
    let id = scan_memory(temp.path())?[0].id.clone();

    let detail = read_memory_detail(temp.path(), &id)?.expect("detail");

    assert_eq!(detail.id, id);
    assert_eq!(detail.content, "# Notes\n\nDurable fact.");
    assert_eq!(detail.privacy.classification, None);
    assert_eq!(detail.privacy.reveal_required, None);
    assert_eq!(detail.verification.state, "unknown");
    let json = serde_json::to_string(&detail)?;
    assert!(!json.contains(temp.path().to_string_lossy().as_ref()));
    Ok(())
}

#[test]
fn memory_overview_reports_unavailable_capabilities_as_unknown() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let sage = temp.path().join(MEMORY_DIR).join("sage");
    fs::create_dir_all(&sage)?;
    fs::write(sage.join("one.md"), "one")?;
    fs::write(sage.join("two.md"), "two")?;

    let overview = memory_overview(temp.path())?;

    assert_eq!(overview.totals.entries, 2);
    assert_eq!(overview.totals.familiars, 1);
    assert_eq!(overview.totals.verified, 0);
    assert_eq!(overview.totals.unknown, 2);
    assert!(overview.capabilities.detail);
    assert!(!overview.capabilities.verification);
    assert_eq!(overview.verification.state, "unavailable");
    Ok(())
}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cargo test -p coven-cli read_memory_detail_returns_content_without_a_filesystem_path --locked -- --nocapture
cargo test -p coven-cli memory_overview_reports_unavailable_capabilities_as_unknown --locked -- --nocapture
```

Expected: compile failure because the detail and overview APIs do not exist.

- [ ] **Step 3: Implement the Phase 1 DTOs and collectors**

Add:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct MemorySourceDto {
    pub kind: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryPrivacyDto {
    pub classification: Option<String>,
    pub reveal_required: Option<bool>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryVerificationDto {
    pub state: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemorySupersessionDto {
    pub supersedes: Option<String>,
    pub superseded_by: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryDetailDto {
    pub id: String,
    pub familiar_id: String,
    pub title: String,
    pub updated_at: String,
    pub source: MemorySourceDto,
    pub content: String,
    pub content_format: String,
    pub privacy: MemoryPrivacyDto,
    pub verification: MemoryVerificationDto,
    pub attestation: Option<serde_json::Value>,
    pub supersession: MemorySupersessionDto,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryOverviewTotalsDto {
    pub entries: usize,
    pub familiars: usize,
    pub verified: usize,
    pub needs_review: usize,
    pub unknown: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryCapabilitiesDto {
    pub detail: bool,
    pub verification: bool,
    pub attestation_metadata: bool,
    pub supersession_history: bool,
    pub mutations: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryOverviewVerificationDto {
    pub state: String,
    pub checked_at: String,
    pub manifest: Option<String>,
    pub index: Option<String>,
    pub issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoryOverviewDto {
    pub generated_at: String,
    pub totals: MemoryOverviewTotalsDto,
    pub last_updated_at: Option<String>,
    pub capabilities: MemoryCapabilitiesDto,
    pub verification: MemoryOverviewVerificationDto,
}

pub fn read_memory_detail(coven_home: &Path, id: &str) -> Result<Option<MemoryDetailDto>> {
    let record = scan_memory_records(coven_home)?
        .into_iter()
        .find(|record| record.id == id);
    Ok(record.map(|record| MemoryDetailDto {
        id: record.id,
        familiar_id: record.familiar_id,
        title: record.title,
        updated_at: record.updated_at_iso,
        source: MemorySourceDto {
            kind: "coven-origin".to_string(),
            label: "Coven origin".to_string(),
        },
        content: record.body,
        content_format: "markdown".to_string(),
        privacy: MemoryPrivacyDto {
            classification: None,
            reveal_required: None,
            reason: "privacy taxonomy unavailable".to_string(),
        },
        verification: MemoryVerificationDto {
            state: "unknown".to_string(),
            reason: "verification metadata unavailable".to_string(),
        },
        attestation: None,
        supersession: MemorySupersessionDto {
            supersedes: None,
            superseded_by: None,
        },
    }))
}

pub fn memory_overview(coven_home: &Path) -> Result<MemoryOverviewDto> {
    use std::collections::HashSet;

    let records = scan_memory_records(coven_home)?;
    let familiar_count = records
        .iter()
        .map(|record| record.familiar_id.as_str())
        .collect::<HashSet<_>>()
        .len();
    let last_updated_at = records
        .iter()
        .map(|record| record.updated_at_iso.as_str())
        .max()
        .map(str::to_string);
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);

    Ok(MemoryOverviewDto {
        generated_at: now.clone(),
        totals: MemoryOverviewTotalsDto {
            entries: records.len(),
            familiars: familiar_count,
            verified: 0,
            needs_review: 0,
            unknown: records.len(),
        },
        last_updated_at,
        capabilities: MemoryCapabilitiesDto {
            detail: true,
            verification: false,
            attestation_metadata: false,
            supersession_history: false,
            mutations: false,
        },
        verification: MemoryOverviewVerificationDto {
            state: "unavailable".to_string(),
            checked_at: now,
            manifest: None,
            index: None,
            issues: Vec::new(),
        },
    })
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
cargo test -p coven-cli read_memory_detail_ --locked -- --nocapture
cargo test -p coven-cli memory_overview_ --locked -- --nocapture
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/coven-cli/src/cockpit_sources.rs
git commit -m "feat(memory): expose overview and detail DTOs"
```

### Task 3: Route the new reads through the versioned daemon API

**Files:**
- Modify: `crates/coven-cli/src/api.rs:450-505`
- Test: `crates/coven-cli/src/api.rs:8063-8078`

- [ ] **Step 1: Write failing route tests**

Add:

```rust
#[test]
fn memory_overview_route_reports_capabilities() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().join("memory").join("sage");
    std::fs::create_dir_all(&root)?;
    std::fs::write(root.join("notes.md"), "Durable fact.")?;

    let response = handle_request("GET", "/api/v1/memory/overview", temp.path(), None)?;
    assert_eq!(response.status, 200);
    let body: serde_json::Value = serde_json::from_str(&response.body)?;
    assert_eq!(body["totals"]["entries"], 1);
    assert_eq!(body["capabilities"]["detail"], true);
    assert_eq!(body["verification"]["state"], "unavailable");
    Ok(())
}

#[test]
fn memory_detail_route_returns_content_and_unknown_ids_return_404() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let root = temp.path().join("memory").join("sage");
    std::fs::create_dir_all(&root)?;
    std::fs::write(root.join("notes.md"), "Durable fact.")?;
    let list = handle_request("GET", "/api/v1/memory", temp.path(), None)?;
    let entries: serde_json::Value = serde_json::from_str(&list.body)?;
    let id = entries[0]["id"].as_str().expect("id");

    let found = handle_request(
        "GET",
        &format!("/api/v1/memory/{id}"),
        temp.path(),
        None,
    )?;
    assert_eq!(found.status, 200);
    let body: serde_json::Value = serde_json::from_str(&found.body)?;
    assert_eq!(body["content"], "Durable fact.");
    assert!(body.get("path").is_none());

    let missing = handle_request(
        "GET",
        "/api/v1/memory/00000000-0000-0000-0000-000000000000",
        temp.path(),
        None,
    )?;
    assert_eq!(missing.status, 404);
    Ok(())
}
```

- [ ] **Step 2: Run the route tests and verify they fail**

Run:

```bash
cargo test -p coven-cli memory_overview_route_reports_capabilities --locked -- --nocapture
cargo test -p coven-cli memory_detail_route_returns_content_and_unknown_ids_return_404 --locked -- --nocapture
```

Expected: both routes return 404 before implementation.

- [ ] **Step 3: Add exact route ordering**

Place overview and detail before the existing exact list route:

```rust
("GET", "/memory/overview") => {
    json_response(200, &crate::cockpit_sources::memory_overview(coven_home)?)
}
("GET", path) if path.starts_with("/memory/") => {
    let id = path.trim_start_matches("/memory/");
    match crate::cockpit_sources::read_memory_detail(coven_home, id)? {
        Some(detail) => json_response(200, &detail),
        None => api_error(
            404,
            "memory_not_found",
            "Memory entry was not found.",
            Some(serde_json::json!({ "memoryId": id })),
        ),
    }
}
("GET", "/memory") => json_response(200, &crate::cockpit_sources::scan_memory(coven_home)?),
```

The exact `/memory/overview` arm must stay before the prefix arm.

- [ ] **Step 4: Update the empty-route regression**

Keep `/api/v1/memory` in `empty_array_stubs_return_200_with_empty_json_array`. Add:

```rust
#[test]
fn empty_memory_overview_is_successful_and_honest() -> Result<()> {
    let temp = tempfile::tempdir()?;
    let response = handle_request("GET", "/api/v1/memory/overview", temp.path(), None)?;
    assert_eq!(response.status, 200);
    let body: serde_json::Value = serde_json::from_str(&response.body)?;
    assert_eq!(body["totals"]["entries"], 0);
    assert_eq!(body["verification"]["state"], "unavailable");
    Ok(())
}
```

- [ ] **Step 5: Run the API tests**

Run:

```bash
cargo test -p coven-cli memory_ --locked -- --nocapture
```

Expected: the scanner, overview, detail, and route tests pass.

- [ ] **Step 6: Commit**

```bash
git add crates/coven-cli/src/api.rs
git commit -m "feat(api): add memory overview and detail reads"
```

### Task 4: Run daemon quality gates and document the contract

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the two endpoints**

Add a concise API section:

```markdown
### Memory dashboard reads

- `GET /api/v1/memory` lists memory summaries.
- `GET /api/v1/memory/overview` returns counts and capability/verification state.
- `GET /api/v1/memory/{id}` returns validated markdown content for an opaque list ID.

The daemon resolves all files under its configured Coven home. Clients must not
construct memory filesystem paths or read the archival index directly.
```

- [ ] **Step 2: Add a changelog entry**

```markdown
- Add backward-compatible memory overview and opaque-ID detail reads for local dashboards.
```

- [ ] **Step 3: Run formatting and focused tests**

Run:

```bash
cargo fmt --all -- --check
cargo test -p coven-cli memory_ --locked
```

Expected: formatting check exits 0 and all memory-focused tests pass.

- [ ] **Step 4: Run full required Coven gates**

Run:

```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --locked
```

Expected: clippy exits 0 and the full workspace test suite passes.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: describe memory dashboard read API"
```

## Daemon handoff

Before starting the UI plan, record:

- the daemon branch/commit;
- the final JSON fixtures from all three endpoints;
- whether Unix socket and loopback HTTP both served the new routes;
- any field differences from the approved design.
