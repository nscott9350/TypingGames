#!/usr/bin/env python3
"""
Prepare the library texts.

The Library mode types real books, so it needs real books on disk. These are
public-domain works, downloaded from Project Gutenberg, stripped of that
project's own header and footer, and reduced to something a US keyboard can
actually produce.

The reduction is the fiddly part and the reason this is a script rather than a
paragraph in the README:

  * Gutenberg's plain text is hard-wrapped at about seventy columns. Left
    alone, every one of those breaks would read as a paragraph break, so
    lines are joined back up and only blank lines separate paragraphs.
  * Curly quotes, em dashes and ellipses are not on the keyboard. They are
    folded to the ASCII a typist can reach — an em dash becomes `--`, which
    is what Gutenberg's own older files use anyway.
  * `_italics_` is markup, not prose, so the underscores go.
  * Accented letters are folded to their base letter. Someone drilling the
    home row should not be stopped by a diaeresis they have no key for.

Front matter is dropped by starting at a named heading. Every one of these
files opens with a title page and a table of contents, and two of them with a
modern editor's preface; none of that is the book. The heading to start at is
given per book in START below and matched against a whole paragraph, because a
contents page lists the same chapter titles the body uses and only an exact
match tells the two apart.

    python3 tools/fetch-books.py            # everything missing
    python3 tools/fetch-books.py gatsby     # just one, re-fetched

Output is library/<id>.NNN.txt in fixed-size chunks plus library/index.json.
Chunks exist so that opening Moby-Dick does not mean downloading Moby-Dick;
the page pulls the two that span wherever your bookmark is.
"""

import json
import os
import re
import sys
import unicodedata
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "library")

# Chunk size in characters. The text is ASCII by the time it is written, so a
# character is a byte and a bookmark can be turned into a chunk index by
# division rather than by scanning.
CHUNK = 32768

# id, Gutenberg number, title, author, year of first publication.
# Where the book proper starts: a heading matched against a whole paragraph,
# and which occurrence of it to take. Occurrence 2 is for the books whose
# contents page lists the heading on a line of its own, so the body's copy of
# it is the second to come past.
START = {
    # This edition sets chapter one's heading inside the illustration that
    # opens it, so the anchor carries the bracket the heading arrives with.
    "pride-and-prejudice": (r"Chapter I\.\]", 1),
    "frankenstein": (r"Letter 1", 1),
    "moby-dick": (r"ETYMOLOGY\.", 2),
    "tale-of-two-cities": (r"CHAPTER I\. The Period", 1),
    "alice-in-wonderland": (r"CHAPTER I\. Down the Rabbit-Hole", 1),
    "treasure-island": (r"PART ONE--The Old Buccaneer", 1),
    "sherlock-holmes": (r"I\. A SCANDAL IN BOHEMIA", 1),
    "dracula": (r"DRACULA", 1),
    "call-of-the-wild": (r"Chapter I\. Into the Primitive", 1),
    "the-great-gatsby": (r"I", 1),
}

BOOKS = [
    ("pride-and-prejudice", 1342, "Pride and Prejudice", "Jane Austen", 1813),
    ("frankenstein", 84, "Frankenstein", "Mary Shelley", 1818),
    ("moby-dick", 2701, "Moby-Dick", "Herman Melville", 1851),
    ("tale-of-two-cities", 98, "A Tale of Two Cities", "Charles Dickens", 1859),
    ("alice-in-wonderland", 11, "Alice's Adventures in Wonderland", "Lewis Carroll", 1865),
    ("treasure-island", 120, "Treasure Island", "Robert Louis Stevenson", 1883),
    ("sherlock-holmes", 1661, "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", 1892),
    ("dracula", 345, "Dracula", "Bram Stoker", 1897),
    ("call-of-the-wild", 215, "The Call of the Wild", "Jack London", 1903),
    ("the-great-gatsby", 64317, "The Great Gatsby", "F. Scott Fitzgerald", 1925),
]

FOLD = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
    "‹": "<", "›": ">", "«": '"', "»": '"',
    "–": "-", "—": "--", "―": "--", "−": "-",
    "…": "...", " ": " ", " ": " ", " ": " ",
    "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE",
    "ß": "ss", "ð": "d", "þ": "th", "Ł": "L", "ł": "l",
    "×": "x", "£": "L", "©": "(c)", "°": " degrees",
}

KEEP = set(
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "0123456789"
    " .,;:!?'\"()-&$/*%#@+=<>"
)


def fetch(num):
    url = f"https://www.gutenberg.org/cache/epub/{num}/pg{num}.txt"
    req = urllib.request.Request(url, headers={"User-Agent": "tippitype-library-prep"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8-sig", errors="replace")


def strip_boilerplate(raw):
    """Keep only the work itself.

    Everything Project Gutenberg adds sits outside a pair of marker lines, and
    what is left between them is the public-domain text and nothing else.
    """
    start = re.search(r"\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*", raw, re.I)
    end = re.search(r"\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG.*?\*\*\*", raw, re.I)
    if not start:
        raise SystemExit("no start marker; the file layout has changed")
    return raw[start.end(): end.start() if end else len(raw)]


def to_ascii(s):
    out = []
    for ch in s:
        if ch in FOLD:
            out.append(FOLD[ch])
        elif ch in KEEP or ch == "\n":
            out.append(ch)
        else:
            # Strip the accent and keep the letter underneath if there is one.
            d = "".join(c for c in unicodedata.normalize("NFKD", ch)
                        if not unicodedata.combining(c))
            out.append("".join(c for c in d if c in KEEP))
    return "".join(out)


# `[Illustration: ...]` is a note about a picture that is not here, and the
# rules of dashes some editions set between scenes are furniture rather than
# text. Neither is something anyone should be asked to type. Square brackets
# are dropped from the keep-set with them, so nothing bracket-shaped survives.
ILLUSTRATION = re.compile(r"\[\s*(Illustration|Frontispiece)\b[^\]]*\]?", re.I | re.S)
RULE = re.compile(r"^[-=*.\s]{4,}$")


def paragraphs(body):
    """Gutenberg's hard-wrapped lines, joined back into paragraphs.

    Illustration markup is left in place here and taken out later, because in
    the illustrated editions a chapter heading can sit *inside* the brackets
    and the heading is what START matches on.
    """
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    body = body.replace("_", "")
    out = []
    for block in re.split(r"\n[ \t]*\n+", body):
        p = re.sub(r"\s+", " ", block).strip()
        if p and not RULE.match(p):
            out.append(p)
    return out


def demarkup(p):
    return re.sub(r"\s+", " ", ILLUSTRATION.sub(" ", p).replace("[", " ")).strip()


def drop_front_matter(book_id, paras):
    pattern, nth = START[book_id]
    rx = re.compile(r"\s*" + pattern + r"\s*\Z")
    seen = 0
    for i, p in enumerate(paras):
        if rx.match(p):
            seen += 1
            if seen == nth:
                return paras[i:]
    raise SystemExit(f"{book_id}: never found the heading {pattern!r} #{nth}")


def prepare(book_id, num):
    paras = drop_front_matter(book_id, paragraphs(strip_boilerplate(fetch(num))))
    paras = [q for q in (demarkup(p) for p in paras) if q]
    # Trailing whitespace would leave the reader with nothing to type and no
    # way to finish the book.
    return to_ascii("\n".join(paras)).strip()


def write(book_id, text):
    for old in os.listdir(OUT):
        if old.startswith(book_id + "."):
            os.remove(os.path.join(OUT, old))
    n = 0
    for i in range(0, len(text), CHUNK):
        with open(os.path.join(OUT, f"{book_id}.{n:03d}.txt"), "w") as f:
            f.write(text[i:i + CHUNK])
        n += 1
    return n


def main():
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, "index.json")
    have = {}
    if os.path.exists(index_path):
        have = {b["id"]: b for b in json.load(open(index_path))["books"]}

    out = []
    for book_id, num, title, author, year in BOOKS:
        if only and book_id not in only:
            if book_id in have:
                out.append(have[book_id])
            continue
        if not only and book_id in have:
            out.append(have[book_id])
            print(f"  have {book_id}")
            continue
        print(f"fetch {book_id} ...", end=" ", flush=True)
        text = prepare(book_id, num)
        chunks = write(book_id, text)
        out.append({
            "id": book_id,
            "title": title,
            "author": author,
            "year": year,
            "chars": len(text),
            "chunks": chunks,
            "gutenberg": num,
        })
        print(f"{len(text):,} chars in {chunks} chunks")

    out.sort(key=lambda b: b["year"])
    with open(index_path, "w") as f:
        json.dump({"chunk": CHUNK, "books": out}, f, indent=2)
        f.write("\n")
    print(f"\n{len(out)} books, {sum(b['chars'] for b in out):,} characters")


if __name__ == "__main__":
    main()
