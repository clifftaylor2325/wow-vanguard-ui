---
name: release
description: Cut a Vanguard release (a version bump, the in-game What's new notes, the tag and the GitHub release with the zip) and hand the site its notes. Use when Cliff says to tag or release a version, or to prepare one.
---

# Cut a release

A release is a version bump merged to `main`, then the `release` workflow. Nothing is published by hand, and the version is bumped only as part of this.

## Before the bump

1. **Everything that ships is merged**: `main` is green (`verify.yml` on the last merge, the latest weekly or hand-started full suite), and no open `ci-failure` issue. A PR still open waits for the next release; it does not get rushed.
2. **The notes exist in the addon**: `Core/WhatsNewNotes.lua` has an entry for this version at the top, one group per module or area, each line in player language with the options `page` and `row` a click opens. Lines are written from the merged PR titles since the last tag (`git log v<last>..main --merges`); a line never describes something that is not merged. `/vg whatsnew` shows them; `scripts/tests` cover `Core/WhatsNew.lua`, so a malformed entry fails a test.
3. **The in-game check**: `docs/SMOKE-TEST.md` run order (section "Run order by crash risk") has been run on the release candidate, or Cliff has said to ship without it. Nothing in this repo can replace that; a release that skipped it says so in its notes.

## The bump

4. One commit on a branch `work/release-<version>`: `## Version` in `Vanguard.toc` to the new version (and `## Interface` to the real build if `/vg status` reported a different one), nothing else. Subject `release: v<version>`. Open the PR (draft, then ready), let `verify.yml` pass, merge.

## The release

5. From the Actions tab on `main`, run **release** (`release.yml`): it refuses a tag that already exists or a run off `main`, runs the whole suite with the coverage floor (`lua-suite.yml`, checks on, preview off), builds `dist/Vanguard-<version>.zip` with `scripts/package.mjs` and publishes the GitHub release `v<version>` with generated notes. Pushing a tag `v<version>` that matches the TOC does the same. Never create the tag or the release by hand. When Actions can't run (billing block) or time is short, Cliff's local route is `node scripts/release-local.mjs` (a rehearsal; `--publish=v<version>` ships), described in `docs/RELEASING.md`; it needs the tag made locally with `git tag` and never pushes one itself.
6. When the run is green, read the release page once: the zip is attached and the tag is on the merge commit.

## After

7. **The site** (`clifftaylor2325/wow-vanguard-ui-site`): `scripts/lib/changelog-content.mjs` gets the release's lines in player language, each with the PR numbers it came from, and `site.config.json`'s `sourceRef` moves to the released commit when the site should show the new release as current. That is a PR on the site repo (its own `CLAUDE.md` applies: nothing hand-copied from the addon, `npm run check` before the PR).
8. **CurseForge** (issue #144): upload the zip or let the packager build from the tag with `.pkgmeta`. This is Cliff's step until the listing exists.
9. Reply in the thread with the release link and what was skipped.

## Never

- Bump the version outside a release, or in a PR that changes anything else.
- Tag a commit the full suite has not passed on.
- Edit a published release's zip; a fix is a new patch version.
