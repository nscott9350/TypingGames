#!/usr/bin/env python3
"""
Check the cache-busting version numbers before a deploy.

GitHub Pages caches assets for about ten minutes, so every page loads its
scripts and stylesheets with a `?v=N` query string and N is bumped by hand
whenever the file behind it changes. The query string is only a cache key —
the server ignores it and always serves the current file — so the whole scheme
rests on nobody forgetting to bump. Forget, and a returning player can load
new HTML against a script the browser still has from before the deploy.

Two things make that easy to get wrong, and this script exists for both:

  * `shared/words.js` and `shared/keyboard.js` are loaded by every game. One
    change to either means bumping seven pages, and six of them are pages you
    were not working on. They are therefore held at a single site-wide number
    here, so a page left behind shows up as a number that does not match the
    others rather than as nothing at all.
  * Most pages carry one number for everything on them, which makes a bump
    all-or-nothing. The trainer and Bug Parade number each file separately,
    which is finer grained and reads better, but it allows the one genuinely
    dangerous mistake: bumping the script you edited and leaving the shared
    file it depends on at its old number. The trainer reads its finger map
    out of `shared/keyboard.js`, so that pairing is real, not theoretical.

What it checks, per reference:

  * the file exists
  * every local .js and .css is versioned at all
  * the file has not changed more recently than its number was last set,
    counting uncommitted edits in the working tree as "changed just now"
  * the shared files carry the same number everywhere

    python3 tools/check-versions.py

Exits non-zero if anything is wrong, so it can gate a deploy.
"""

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The files every game loads, and which therefore have to move in step.
SHARED = ("shared/words.js", "shared/keyboard.js")

REF = re.compile(r'(?:href|src)="([^"]+?)\?v=(\d+)"')
UNVERSIONED = re.compile(r'(?:href|src)="(?!https?:|//)([^":]+\.(?:js|css))"')

# Bigger than any commit timestamp, so an uncommitted edit always reads as
# newer than any bump that only exists in history.
NOW = float("inf")


def git(*args):
    out = subprocess.run(
        ["git", "-C", ROOT, *args], capture_output=True, text=True
    )
    return out.stdout.strip()


def dirty(path):
    """True if the working copy differs from what is committed."""
    return git("status", "--porcelain", "--", path) != ""


def last_changed(path):
    """When the file last changed, as a commit timestamp."""
    if dirty(path):
        return NOW
    ts = git("log", "-1", "--format=%ct", "--", path)
    return int(ts) if ts else 0


def version_set_at(page, ref, version):
    """
    When this page last started saying `ref?v=version`.

    `git log -S` finds the commits where that exact string appeared or
    disappeared; the most recent is the one that put the current value there.
    A page with uncommitted edits is treated as having been bumped now, which
    is what makes the script usable before committing rather than only after.
    """
    if dirty(page):
        return NOW
    log = git("log", "-S", f"{ref}?v={version}", "--format=%ct", "--", page)
    return int(log.splitlines()[0]) if log else 0


def pages():
    """
    Every page that is or could be part of the site.

    Tracked files are not enough. A game that has just been written is not
    committed yet, and that is precisely the moment its numbers are worth
    looking at — checking only what git already knows about would have waved
    a whole new game through in silence. So untracked pages count too, with
    anything gitignored left out.
    """
    tracked = set(git("ls-files", "*index.html").splitlines())
    loose = set(git("ls-files", "--others", "--exclude-standard", "*index.html").splitlines())
    return sorted(tracked | loose), tracked


def main():
    problems = []
    shared_seen = {}
    checked = 0

    all_pages, tracked = pages()
    untracked = [p for p in all_pages if p not in tracked]

    for page in all_pages:
        with open(os.path.join(ROOT, page), encoding="utf-8") as fh:
            src = fh.read()
        page_dir = os.path.dirname(page)

        for bare in UNVERSIONED.findall(src):
            problems.append(f"{page}: {bare} is loaded without a ?v= number")

        for ref, version in REF.findall(src):
            checked += 1
            asset = os.path.normpath(os.path.join(page_dir, ref))

            if not os.path.exists(os.path.join(ROOT, asset)):
                problems.append(f"{page}: {ref} does not exist")
                continue

            # Only pages that actually ship are held to the shared number.
            # An untracked page is not on the site yet, so it cannot leave one
            # behind — and a stale copy of an old game sitting in the working
            # tree should not be able to fail the check for the live ones.
            if asset.replace(os.sep, "/") in SHARED and page in tracked:
                shared_seen.setdefault(asset.replace(os.sep, "/"), {}) \
                           .setdefault(version, []).append(page)

            if last_changed(asset) > version_set_at(page, ref, version):
                problems.append(
                    f"{page}: {asset} has changed since ?v={version} was set "
                    f"— bump it"
                )

    # The shared files are the ones worth saying something extra about, since
    # a page left behind here is a page nobody was looking at.
    for asset, by_version in sorted(shared_seen.items()):
        if len(by_version) > 1:
            spread = "; ".join(
                f"v={v} on {', '.join(sorted(p))}"
                for v, p in sorted(by_version.items(), key=lambda kv: int(kv[0]))
            )
            problems.append(f"{asset}: not the same number everywhere — {spread}")

    if problems:
        print(f"{len(problems)} problem(s) in {checked} versioned references:\n")
        for p in problems:
            print(f"  {p}")
        return 1

    shared_note = ", ".join(
        f"{a} at v={next(iter(v))}" for a, v in sorted(shared_seen.items())
    )
    print(f"{checked} versioned references across {len(all_pages)} pages, all current.")
    print(f"Shared: {shared_note}.")
    if untracked:
        print(f"Not committed yet (checked, but not deployed): {', '.join(untracked)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
