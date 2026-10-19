# Official Admin link resolver fixtures

These fixtures run the released ioBroker.admin link resolver against the current
LOEWE adapter metadata and its actual Web extension. They reproduce the old
failure and verify the minimum supported Admin release without simulating a
manually corrected version of the resolver.

| Admin release | Purpose | Official source commit |
| --- | --- | --- |
| 8.0.14 | Broken baseline: both TV links become `/loewe-tv/` | `e4b39b810f5f12cd6e969e25a39ff6f3188a6608` |
| 8.0.22 | First published release preserving path and `%instance%` | `4dbd23e49ed8d177f2bda06f9a40f4d490bffd58` |
| 8.3.0 | Current released resolver when the fix was prepared | `2f0bf3e7ef3f11cb03a04b0305bb00674080a88d` |

The [8.0.22 release](https://github.com/ioBroker/ioBroker.admin/releases/tag/v8.0.22)
documents the correction of
[issue 3661](https://github.com/ioBroker/ioBroker.admin/issues/3661). The same
helper file remained unchanged between Admin 8.0.14 and 8.0.21: both have Git
blob `9f095ef4c0270aa2ba295fa8889b634183b48ea0`.

## Provenance and transformation

`sources/` contains the original upstream `src-admin/src/helpers/utils.ts`
files. `sources.json` records their release tags, exact commits, paths, original
Git blob IDs, source SHA-256 hashes and generated fixture SHA-256 hashes. The
upstream MIT license is retained verbatim in `LICENSE`.

The CommonJS files were generated once with Node.js 24.19.0. `build.cjs` removes
TypeScript types using `node:module.stripTypeScriptTypes` in `strip` mode, removes
ES module `export` keywords, and exposes the tested functions through
`module.exports`. It adds strict mode and provenance comments. No resolver
condition, placeholder behavior, path or return value is patched. The original
complete helper files are kept together, including internal helper functions.

To rebuild offline from the repository root with Node.js 24:

```bash
node test/fixtures/admin-link-resolver/build.cjs test/fixtures/admin-link-resolver/sources
```

The builder validates the original Git blob IDs before generating anything.
The test also verifies source, generated fixture and license hashes. Ordinary
test runs load the generated CommonJS, so no network, TypeScript dependency or
TypeScript stripping API is required on Node.js 22.

## What is exercised

`test/admin-link-routing.test.js` passes `io-package.json`'s current link into
each real resolver. The resolved requests enter a shared Express-compatible
middleware chain with the actual `EpgWebExtension` for TV 1 and TV 0, in that
order. The final response must equal the installed EPG HTML. Neither direct
instance link may visit the generic TV selection entry.

Coverage includes the original failure, the declared Admin minimum, two TVs
sharing a Web instance, TVs assigned to different Web instances, host and port
selection, HTTPS, the released reverse-proxy rewrite, the released Cloud URL
rewrite, unchanged per-TV Cloud welcome-page links, Admin-only fallback,
authentication and ambiguous instance parameters.

These are resolver and adapter integration tests. They do not start a complete
Admin frontend or a live Cloud service, test a browser cache, or contact a TV.
In particular, the Cloud test checks Admin's URL rewrite separately from the
extension's existing canonical welcome-page route; it does not pretend to test
Cloud's server-side routing of Admin assets.
