# Releasing

## The normal path: merge the Release PR

[release-please](https://github.com/googleapis/release-please) keeps a **Release PR** open on
this repo. It accumulates every change on `main`, deriving the next version and the changelog
from conventional commit messages (`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE` →
major).

**To release: merge that PR.** Nothing else. The merge bumps `package.json` + `CHANGELOG.md`,
creates the matching `vX.Y.Z` tag and GitHub Release, and dispatches the `publish` workflow at
that tag — which re-runs the full verification gate (typecheck → tests → build → packaging +
size checks) and publishes to npm via **trusted publishing** (OIDC, no tokens) with
**provenance**.

A human never types a version and never creates a tag, so the tag and `package.json` cannot
disagree — the failure mode this design exists to prevent.

Do **not** create releases or `v*` tags through the GitHub UI; the Release PR is the release.

## After a release: bump the pinned CDN versions

The documented CDN URLs are pinned to an exact version and release-please does not rewrite
them. Once the release is on npm, update `README.md` and `src/sw.ts` here, plus the integration
guide, demo and example stubs in the platform repo.

## Emergency fallback: manual tag

If the bot path is ever unavailable, a hand-pushed tag publishes through the same gate:

```sh
npm version 0.9.1        # bumps package.json + creates the matching tag
git push --follow-tags
```

The workflow refuses a tag that does not match `package.json`.

## One-time npm setup (done)

The publish workflow authenticates with **trusted publishing** — configured on npmjs.com under
the package's **Settings → Trusted publisher** (this repository, workflow `publish.yml`). If the
trusted-publisher binding ever needs a from-scratch manual publish, use
`npm publish --provenance=false` from a logged-in machine (provenance attestations mint only
inside CI); `publishConfig` pins public access either way.
