# Releasing to npm

Releases of `@opencoven/coven-memory-dashboard` are published by
`.github/workflows/release-npm.yml`. The publish job authenticates directly
from GitHub Actions to npm through OpenID Connect (OIDC), without an npm token,
and requests npm provenance for every artifact.

## One-time setup

Configure the package's Trusted Publisher on npm:

- Organization: `OpenCoven`
- Repository: `coven-memory`
- Workflow filename: `release-npm.yml`
- Environment: leave blank
- Allowed actions: `npm publish` only

Configure the repository variable `NPM_RELEASE_ALLOWED_SIGNERS` with one or
more SSH allowed-signers lines. A wildcard principal is appropriate because
the public key itself is the trusted identity:

```text
* ssh-ed25519 <release-signing-public-key>
```

Set it with GitHub CLI from a file containing only those allowed-signers lines:

```bash
gh variable set NPM_RELEASE_ALLOWED_SIGNERS --body-file allowed-signers
```

Do not commit the temporary file. Public signing keys are not secrets, but the
variable keeps signer rotation separate from source changes.

Each release maintainer must register that public key with GitHub as a
**signing key** and configure Git to create SSH signatures:

```bash
git config --global gpg.format ssh
git config --global user.signingkey "key::ssh-ed25519 <release-signing-public-key>"
git config --global gpg.ssh.allowedSignersFile /absolute/path/to/allowed-signers
```

The local allowed-signers file must contain the same key as
`NPM_RELEASE_ALLOWED_SIGNERS`. `git verify-tag` must succeed locally before
the tag is pushed; GitHub must also display the tag signature as verified.

## Cut a release

Start from an up-to-date `main`, choose the next unused npm version, and update
`package.json` without creating an automatic tag:

```bash
git switch main
git pull --ff-only
pnpm version patch --no-git-tag-version
pnpm install --lockfile-only
pnpm check
pnpm test:package
pnpm audit:prod
```

Commit the version change through the normal pull-request process. After that
commit is merged, create an annotated signed tag on the merged commit:

```bash
git switch main
git pull --ff-only
version="$(node -p "require('./package.json').version")"
git tag -s "v$version" -m "Release v$version"
git verify-tag "v$version"
git push origin "v$version"
```

The workflow rejects lightweight tags, unverified signatures, signers outside
`NPM_RELEASE_ALLOWED_SIGNERS`, tags not contained in `origin/main`, and tags
whose version differs from `package.json`.

## Verify the publication

After the workflow succeeds, confirm the registry version and provenance:

```bash
version="$(node -p "require('./package.json').version")"
npm view "@opencoven/coven-memory-dashboard@$version" version
npm view "@opencoven/coven-memory-dashboard@$version" dist.attestations --json
```

The package page on npm should show a provenance statement linked to this
repository and release workflow.

After the first Trusted Publishing release succeeds, set the package's
**Publishing access** to **Require two-factor authentication and disallow
tokens**. Revoke any legacy automation token only after the OIDC path has been
proven.

## Recovery

### Invalid or unsigned tag

If npm has not published the version, delete the invalid remote and local tag,
then recreate it as a signed annotated tag on the same merged `main` commit:

```bash
git push --delete origin "v$version"
git tag -d "v$version"
git tag -s "v$version" -m "Release v$version"
git verify-tag "v$version"
git push origin "v$version"
```

Never move or recreate a tag for a version that npm has already published.

### Version conflict

npm versions are immutable. If the version already exists, bump to a new
version, merge that change to `main`, and create a new signed tag. Do not reuse
or overwrite the existing version.

### OIDC or provenance failure

Confirm the npm Trusted Publisher values match the one-time setup exactly, the
workflow still grants `id-token: write` only to the publish job, and the
workflow uses a Trusted Publishing-compatible npm CLI. Rerun the failed job
only after confirming that npm did not publish the version. If publication
succeeded but a later step failed, verify the existing package rather than
attempting to publish the same version again.
