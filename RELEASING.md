# Releasing

Releases are tag-driven: pushing `vX.Y.Z` runs the `release` workflow, which re-verifies
(typecheck → tests → build → packaging + size checks) and publishes to npm with **provenance**.

## Cutting a release

```sh
npm version 0.2.0        # bumps package.json + creates the v0.2.0 tag
git push --follow-tags
```

The tag must match `package.json` — the workflow refuses to publish otherwise.

## One-time npm setup

The workflow authenticates with **trusted publishing** (GitHub OIDC — no npm token stored in
the repo):

1. On npmjs.com, under the package's **Settings → Trusted publisher**, add:
   repository `dark-mode-pro/moonsender-push-sdk`, workflow `release.yml`.
2. If the registry does not offer trusted-publisher setup before a package's first publish, do
   the first one manually from a logged-in machine — `prepublishOnly` runs the full gate:

   ```sh
   npm publish --provenance=false
   ```

   then configure the trusted publisher and use tags from there on.

`publishConfig` pins `access: public` and `provenance: true`. Provenance attestations can only
be generated inside a supported CI provider (GitHub Actions OIDC) — hence the
`--provenance=false` override for manual publishes; tag-driven releases keep full provenance.
