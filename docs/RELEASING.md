# Releasing Vanguard when Actions can't (or time is short)

Two routes ship the same files. The normal one is the `release` workflow in GitHub Actions. The local one is `scripts/release-local.mjs`, which needs no Actions minutes and takes the same checks, the same release zip and the same CurseForge and Wago packager. Which version to cut and when is Cliff's call; nothing here tags, pushes or publishes until you say so.

## One-time setup (do it before launch day)

- Node 22 and `gh` signed in as Cliff (`gh auth status`); `bash`, `git`.
- `lua5.1` (`luac5.1`) on the PATH, so the Lua 5.1 syntax check runs. Without it the script says it skipped it.
- `CF_API_KEY` (CurseForge, Account → API Tokens) and `WAGO_API_TOKEN` (Wago, Developer tools) in your shell environment. The script never prints them, writes them to a file or puts them on a command line.
- `npm install` once.
- Run a **rehearsal** now: `node scripts/release-local.mjs --fast`. It does every check and build and runs the packager with its upload switched off, so you learn about problems on a quiet day. It lists what would stop a publish (for example, "tag … does not exist here") without stopping.

## Launch-day hotfix, step by step

1. Merge the fix to `main` (a branch and a PR, never a direct commit). `git checkout main && git pull`.
2. Bump the version in a release PR of its own (the `release` skill): `## Version` in `Vanguard.toc`, a released heading for the version at the top of `docs/CHANGELOG.md`, and an entry for it at the top of `Core/WhatsNewNotes.lua`. Merge it and pull `main` again.
3. Tag the release commit **here only**: `git tag v<version>`. Do not push the tag; the GitHub release step creates it on GitHub.
4. Rehearse once more: `node scripts/release-local.mjs`. Everything under "Would block a publish" must be empty. This runs `npm run quality`, `npm run test:quick`, `npm run coverage` (about 7 minutes), the zip and its check, and the packager without uploading.
5. In a real hurry, add `--fast` to skip coverage. The run says so, and the PR or release notes should too.
6. Publish: `node scripts/release-local.mjs --publish=v<version>`. The value after `=` must be `v` plus the TOC version, so a stale command can't ship the wrong thing. It uploads to CurseForge and Wago, then creates the GitHub release (the zip attached, the tag created on GitHub at that commit). Each upload runs even if another fails, and the last line names any that failed.
7. Open the CurseForge and Wago pages and the GitHub release once. The first real upload also shows whether CurseForge lists the file as Forever only or as retail too (the TOC's second Interface value is a retail one); that is the one thing nobody has seen yet.
8. Tell the site thread: release notes in `scripts/lib/changelog-content.mjs`, and `sourceRef` in the site's `site.config.json`.

Options: `--no-listings` (GitHub only), `--no-github` (stores only), `--fast`, `--help`.

## What it checks before it publishes

Clean working tree; on `main` and equal to `origin/main`; the tag exists locally and points at HEAD; the tag isn't already on `origin` (a published version is never replaced: fix it with a new version); the newest changelog heading is the TOC version and not "not released yet"; `Core/WhatsNewNotes.lua` has the version; both tokens are set. Then the checks above. Any failure stops the run before anything is uploaded.

## If the script itself fails

- **Packager download refused**: the file must match the SHA-256 pinned in `scripts/release-local.mjs` (the same packager version `release.yml` pins). A mismatch means the download isn't what we reviewed; don't override it.
- **Manual upload** (last resort): `node scripts/package.mjs` builds `dist/Vanguard-<version>.zip`, `node scripts/check-zip.mjs --zip dist/Vanguard-<version>.zip` checks it. Upload it on the CurseForge project (1743404) and Wago (jK8Wor6y) pages by hand, and `gh release create v<version> dist/Vanguard-<version>.zip --generate-notes` for GitHub.
- **Wrong release published**: never edit a published zip. Cut the next patch version.

## Needs an in-game check

Nothing in this route has run against the live CurseForge or Wago APIs: the rehearsal uploads nothing. The first real publish is the test, so rehearse early and read the result pages.
