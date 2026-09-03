# Type Arcade

Arcade games that teach you to touch type. The keyboard is the only input —
there is no aiming and no movement key. You target by typing, and the words
are the controls.

**Play: https://tippitype.com**

## The games

### Blaster — multidirectional shooter

Rocks drift in from every edge of the screen, each carrying a word. Type a
word's first letter to lock on; your ship rotates to aim, every correct letter
fires a shot, and the rock breaks apart when the word is finished. Endless, with
the pressure ramping the longer you survive.

### Squadron 1981 — formation shooter

Swarms fly in along curved entry paths, settle into a formation that sways, then
peel off to dive at you and shoot. Your ship slides along the bottom of the
screen. Clear a wave to advance. Bosses can open a tractor beam that captures
your ship — type the rescue word before the timer runs out to break free.

### Sentinel — city defense

Warheads fall from the night sky toward six cities, and you are the only thing
between them. Type a warhead's word to intercept it; every interception leaves a
fireball that destroys anything caught inside, so firing into a cluster takes out
several at once. From the later waves some warheads split partway down into
several smaller ones. The run ends when the last city is gone.

Unlike the other two you are defending something other than yourself, so which
warhead to shoot next — the lowest, or the one over a cluster — is the real
decision.

### Squadron 3030 — formation shooter

The same shape of game as Squadron 1981, painted rather than drawn. Hostiles warp
into formation above a ship's console and break off to dive; each carries a
call sign on its own name plate, and the plates are color-matched to the
creature above them, so a tag says which hostile it belongs to before the word
has been read.

Thirteen designs and three capital ships share the three roles Squadron 1981
already had, one design per role per wave — so the types stay tellable apart
while the whole roster gets an outing across a run. The HUD docks into the
console printed across the foot of the background, which leaves the entire
starfield above as playfield.

### Bug Parade — fixed shooter

A centipede is a word, one letter per segment, head first. Type the head's
letter and the head bursts; the segment behind it becomes the new head and
carries the next letter — so the key you need is always on the front of the
thing crawling towards you, and the word unspools as you eat it.

Every segment you burst leaves a **mushroom** where it died, and mushrooms are
what turn a centipede down a row. So the garden gets more tangled the better you
play, and the parade arrives sooner for it. Finishing a whole word blooms the
last segment and clears the mushrooms around it, which makes seeing a word
through worth more than the points: abandoning one halfway leaves its cover
behind.

Three loose bugs work the edges. **Spiders** bounce through the beetle's own
strip and eat the cover there, which is the only thing that reliably opens it
back up. **Fleas** drop straight down and seed a column of mushrooms on the way.
**Scorpions** cross the upper rows poisoning whatever they walk past, and a
centipede that meets poisoned cover plunges straight down at you instead of
stepping around it — killing the scorpion clears the poison it laid.

The playfield is a painted garden, so it is letterboxed to the painting and the
HUD docks into the console printed across its foot.

### Gopher vs Ants — marble popper

A column of ants marches down a garden trail toward a gopher's burrow. Typing an
ant's word sends a berry after it and the column closes the gap — and if that
brings three of a color together they scatter too, which can cascade. Ants that
reach the burrow wear it down; when it gives out you lose one of three lives.

Only the ants nearest the burrow carry words, so targeting is never ambiguous;
the rest show only their color, which is what you plan on. Taking the front ant
can never cascade, because nothing sits ahead of it — so the most urgent ant and
the most valuable one are rarely the same, which is the whole game.

Each ant within reach wears a single letter — the key that locks it — and only
the ant you lock spells its word out, in place. A word beside every ant needed
about twice the room the ants leave between them, which is what capped the game
at six targets and the words at five letters. One glyph per ant lifts both:
eight ants in reach at Beginner and twelve at Master, with practice words up to
seven letters.

How many are in reach is the difficulty's real lever. It sounds like a
readability setting and is actually the choice dial: with four in reach a
cascade is on offer about a third of the time, so most turns collapse into
taking the front ant — which by design can never cascade. At twelve it is
roughly seven times in ten, against a hard ceiling of about three in four,
since sometimes no cascade exists anywhere on the trail.

The playfield is a painted garden rather than a drawn one, so the route is
letterboxed to the painting's aspect ratio and the ants walk the trail the
picture actually shows.

## The trainer — adaptive drill

Not a game. No score, no lives, no combo: a line of words, a caret, and a
running WPM. It exists for the part the games are bad at, which is working on
the specific thing you are bad at.

It times every keystroke and records every miss, per letter. A key is counted
weak if it is **slow relative to the rest of your own keyboard**, or if you
miss it — either signal alone is enough. Both matter, because they fail in
opposite directions: judge on accuracy alone and the winning move is to type
slowly, which is the habit that keeps people at 40wpm; judge on speed alone and
it rewards hammering through mistakes. Everything is measured against your own
median key rather than a target, so the drill reads the same at 30wpm and 90.

Weak keys then bias what you are given. Every word in the pool is scored on the
letters it contains — its average weakness, plus a weight on its worst letter,
so a word earns its place for the hard reach inside it rather than for being
long. In practice a weak key turns up in roughly **four times** as many words as
chance would give it, and the text stays real English throughout.

Three words in ten are still picked at random. That is not variety for its own
sake: drill only the keys you are currently bad at and the rest of the keyboard
stops being measured, its averages go stale, and the trainer ends up chasing
what it believed ten minutes ago.

Everything is a recency-weighted average with a half-life of about eight
presses of that key, so "your weak keys" means the last few minutes, not a
lifetime record — which keys are failing changes with fatigue and warm-up. New
keys are shrunk toward neutral until there is enough evidence to trust them, so
one unlucky miss cannot hijack the session.

The end-of-run screen shows a heatmap of the whole keyboard, and the weakest
keys with the finger each belongs to, the ms per press, and the miss rate.

A wrong letter stops you where you are. The letter you needed turns red and the
caret holds on it until you type it, so the correction is made against the key
you actually missed rather than the next one along. Every wrong press while you
are held counts as another miss on that key — being unable to find a key is a
different failure from slipping on it, and the drill should hear about both. A
word you had to correct still shows as fumbled once you move past it, even
though what you left on screen is perfect.

**Space is one of those wrong keys.** Pressed before the word is finished it
does not carry you over the rest of it; it holds you exactly where a wrong
letter would, and the miss lands on the letter you still needed. That leaves
no way past a key you cannot find, which is the point — skipping the word was
the one hole left in the rule that a mistake is made good where it happened,
and a key you have to hunt for is the thing the drill most wants to hear about.

| Key | Action |
| --- | --- |
| letters | type the word |
| `Space` | next word, once you have finished this one |
| `Backspace` | clear a held mistake, or rub out a letter already typed |
| `Tab` | restart |
| `Esc` | end the run and show the summary |

Sessions are 30, 60 or 120 seconds, or endless. **Click the clock to hide it**
— it is the only number on the page that keeps moving while you are not
typing, so it is the only one that can pull your eye off the word. Hidden, the
slot keeps its label and shows a mark that does not move, and a timed run
still ends on time. The choice is kept with the session length.

What it has learned is kept in `localStorage` and carries across sessions;
**Forget what you've learned about me** on the summary screen wipes it.

The trainer draws on a larger pool than the games — the shared sets carry `q`
in five words and `z` in twelve, which is a loop rather than a drill once the
trainer starts hunting for them, so `trainer/words.js` adds depth on the rare
and awkward letters.

## Reps — the same line, again

Reached from **Reps** in the top bar. The drill exists to measure you, so it
never shows you the same word twice in a row. That is exactly wrong for the
other half of learning a key: a reach becomes automatic by being made over and
over with nothing else in the way, which is what typing courses have always
done and what neither the drill nor a book will do for you.

So a drill here is one short line built around a single key, and you type that
line several times. Three phrases, in the order the reach is actually learned:

```
zzz aza zaz   zpzp pzpz   zap zip zoo zeal
```

The first is the stroke on its own, out of home position and back to it. The
second alternates it against the key in the same place on the other hand, so
it stays a reach rather than a finger you are leaning on. The third puts it
inside real words, which is where it has to work. The line is built once and
then repeated verbatim — re-rolling the words each pass would make it a
different exercise every time, which is the one thing a repetition drill
cannot be.

Each pass starts on its own line, so the shape of the repetition is something
you see rather than something you count, and a row of pips beside the key
shows how many are left. **3, 5, 8 or ∞** passes per drill; endless holds you
on one key until you move yourself.

Which key you get is the model's call — the ladder is ordered weakest key
first, and falls back to the classical home-row-outward course until there is
enough evidence to have an opinion. The whole alphabet is always on the ladder,
so <kbd>←</kbd> and <kbd>→</kbd> walk to any key you want, and they move
relative to the line under the caret rather than the one being generated ahead
of it.

| Key | Action |
| --- | --- |
| letters | type the line |
| `Space` | next group, once you have finished this one |
| `←` `→` | previous / next key on the ladder |
| `Tab` | restart |
| `Esc` | end the run and show the summary |

What reps deliberately do *not* do is feed timings back into the per-key model.
A line you have typed four times is a line you have memorised, and what it
measures after that is recall rather than reach — count it and the trainer
would be told you had fixed a key you had only just learned to anticipate.
Misses still count, because missing a key on the fifth pass is a real signal.
The practical consequence is that the ladder's ordering comes from your drill
and library runs; reps spend what those found rather than adding to it.

## The library — type a whole book

The other half of the trainer, reached from **Library** in the top bar. The
drill picks words to work on your weak keys; this does the opposite. The text
is fixed, it is somebody else's, and you take it in the order it was written.

What a book gives you that no word list can is everything *between* the words.
Capitals and the shift that reaches them, commas, apostrophes, quotation marks,
full stops — about a fifth of real typing, and none of it appears in a drill
made of lowercase words. Paragraph breaks are a keystroke too: they are drawn
as a `¶` and you press `Enter` for them.

A wrong character stops you where you are, exactly as it does in the drill —
which matters more here, because running on would leave you a character out of
step with the text for the rest of the page. Backspace clears the stop; there
is never anything behind the caret to fix, since nothing wrong can get past it.

Ten books are bundled, from *Pride and Prejudice* to *The Great Gatsby*. All of
them are in the public domain, which is the only reason they can ship inside a
static site — a book still in copyright cannot, whoever asks for it. Nothing is
uploaded and nothing is fetched from anywhere else: the texts sit in `library/`
and your place in each of them sits in `localStorage`.

Your place is the point. A book is somewhere to be rather than a score to beat,
so opening one puts the caret exactly where you left it, however many sessions
ago, and the shelf shows how far into each you are. Runs still count for WPM
and accuracy, and every letter still feeds the same per-key model the drill
uses — a capital counts as its letter, since it is the same reach with a shift
on the end of it.

A million characters would be a million spans, so only a window of about two
thousand around the caret is ever in the page, and the text arrives in 32KB
pieces as you approach them. Opening *Moby-Dick* does not download *Moby-Dick*.

## How to play

| Key | Action |
| --- | --- |
| any letter | start a run, or lock onto the word beginning with that letter |
| letters | each correct letter fires a shot at your locked target |
| `Space` | *(both Squadrons, Bug Parade)* dart aside, burning any shots you roll through; two charges |
| `Esc` | pause and open settings |
| `Q` | quit the current run (from the pause screen, press twice to confirm) |
| `M` | return to the main menu (from the summary screen) |
| `Enter` | play again (from the summary screen) |

In most of the games you must finish a word before you can target anything
else, so choosing what to shoot next is part of the game. Where two targets
start with the same letter, the one closest to you wins. Chaining correct
letters builds a score multiplier up to 5x; a mistake resets it.

**Bug Parade is the exception**: a key that is not the letter your target
wants will take you to whatever else is waiting on it. Your own target always
gets first claim on the key, so a word can still be finished when something
else on screen shares that letter, and what you typed on the one you left is
kept — its tag still shows how far in you were, and going back means pressing
the letter it is waiting on rather than starting it again. Spiders are the
reason. They cross the beetle's own strip in a couple of seconds, so a rule
that made you finish a nine-letter centipede first meant you could never
answer one.

In both Squadrons and in Bug Parade the difficulty setting changes the rules, not
just the numbers. Up to Normal your craft steers itself around danger and each
correct letter briefly shields you. From **Hard** upward both assists are
switched off and survival is down to timing your own space-bar jukes. You carry
two charges, since an attack run is usually two threats — the diving ship, and
the shot trailing about a second behind it — and after a juke the craft holds its
new position rather than sliding back into the shot's path.

Bug Parade's beetle keeps one habit at every difficulty: it will back away from
something about to touch it. That is not the assist, it is a correction — the
beetle lines itself up under whatever you are typing at, and without it a
centipede that has reached the beetle's own strip would be something it walks
into on purpose. Difficulty sets how early it flinches.

## Keyboard guide

Every game can fade a keyboard across the play field and light up the key you
need next, so you never have to glance down. It is drawn large and faint,
behind the action, and sits in the part of the screen you are already watching —
a small keyboard tucked along the bottom edge would still cost you the glance
down that the guide exists to prevent.

**Settings** offers three modes:

| Mode | Behavior |
| --- | --- |
| **Off** | never shown (the default) |
| **When stuck** | hidden until you miss three keys in a row, then fades in until you get one right |
| **Always** | on for the whole run |

*When stuck* is the one to reach for once you know roughly where the keys are:
it stays out of the way while you are managing, and appears the moment you are
hunting — so there is nothing to lean on except when you actually need it.

Keys are color-coded by **which finger should press them**, which is the part
that actually transfers — knowing where `P` lives is far less useful than
knowing it belongs to the right pinky. Eight lamps sit above the keyboard, one
per finger, numbered the way typing courses do it — index 1 out to pinky 4, so
the row reads `4 3 2 1 · 1 2 3 4`. Each sits over the home key its finger rests
on, and the one you need lights up in that finger's color. The home-row keys
carry a marker too, with a heavier one under `F` and `J` for the raised bumps
you use to find home position by touch.

Press the wrong key and it is struck out in red where it sits, right beside the
key you actually wanted — so a mistake tells you which reach went astray rather
than only costing you points.

Every key that would take a lock lights up dimly, so choosing what to shoot
next is a visible decision rather than a hunt across the screen. In Bug Parade
they stay lit behind the letter you are on, since breaking off mid-word is
allowed there and the choice is a live one the whole time.

## Practice word sets

Every game shares the same word sets, so you can drill one part of the
keyboard and then take it into any of them. Choose in **Settings**:

- **Home row** — words using only `a s d f g h j k l`
- **Left hand** / **Right hand** — one side of the keyboard at a time
- **Common words** — the words that actually come up most when typing English
- **All words** — the full mixed vocabulary

Every target on screen is given a different starting letter, so a keypress
is never ambiguous. Narrow sets therefore cap how many targets can appear at
once — the home row only offers eight distinct starting letters, so the
Squadrons form a smaller, tighter formation on that setting.

Or let the [Trainer](#the-trainer--adaptive-drill) choose instead of picking a
set yourself — it weights words toward whichever keys you are currently slow or
inaccurate on.

Runs track WPM, accuracy and your best streak, and each difficulty keeps its own
top-ten table. Everything is stored locally in your browser; no scores, no
keystrokes and nothing you type are ever uploaded. The site counts page visits
anonymously (GoatCounter — no cookies, no personal data) and that is the whole
of it.

## Running locally

No build step and no dependencies — it is plain HTML, CSS and canvas. Serve the
folder over HTTP (opening the files directly will not work, because the games
load a shared script):

```bash
python3 -m http.server 8642
```

Then open http://localhost:8642.

## Project layout

```
index.html, hub.css     the arcade landing page
favicon.svg             the site icon; favicon.ico and apple-touch-icon.png
                        are generated from it (see below)
blaster/                Blaster (index.html, game.js, style.css)
squadron/               Squadron 1981 (index.html, game.js, style.css)
sentinel/               Sentinel (index.html, game.js, style.css)
burrow/                 Gopher vs Ants (index.html, game.js, sprites.js, style.css)
burrow/images/          the painted background and sprite sheets it draws from
squadron3030/           Squadron 3030 (index.html, game.js, sprites.js, style.css)
squadron3030/images/    its painted background and sprite sheets
bugparade/              Bug Parade (index.html, game.js, sprites.js, style.css)
bugparade/images/       its painted garden and sprite sheets
trainer/                Trainer (index.html, trainer.js, words.js, style.css)
trainer/reps.js         reps: one letter drill, repeated
trainer/book.js         the library: typing a book rather than a word list
library/                the book texts, in 32KB chunks, plus index.json
tools/fetch-books.py    what prepared them (see below)
shared/words.js         word sets, shared by every game
shared/keyboard.js      on-screen keyboard guide, shared by every game
```

The trainer is DOM and CSS rather than canvas, since it is setting text rather
than drawing a scene. It reads the finger map out of `shared/keyboard.js` rather
than keeping a second copy that could drift.

The drill, the reps and the library share that page and everything under the
text — the caret, the clock, the per-key model, the summary. `reps.js` and
`book.js` only decide what is on the page and what a keystroke means against
it. Reps go further and reuse the drill's own word machinery: a group is a
word as far as the caret is concerned, so all `reps.js` supplies is which
group comes next.

Each game keeps its own settings and high scores under its own `localStorage`
keys, so they never interfere with one another.

## Regenerating the icon

`favicon.svg` is the source; the other two are exports. There is no ImageMagick
here, so the raster path goes through the macOS built-ins — Quick Look renders
the SVG and `sips` resizes it. Quick Look honors the SVG's intrinsic size, so
the copy it rasterizes has to be pinned large or it renders small in the corner
of the canvas:

```bash
sed 's|viewBox="0 0 64 64"|& width="512" height="512"|' favicon.svg > /tmp/big.svg
qlmanage -t -s 512 -o /tmp /tmp/big.svg
sips -z 180 180 /tmp/big.svg.png --out apple-touch-icon.png
```

`favicon.ico` bundles 16, 32 and 48px PNGs in an ICO container, which `sips`
cannot write — it is packed by hand with `struct`. The touch icon is exported
from a square variant (`rx` removed), because iOS applies its own rounded mask
and would otherwise round the corners twice.

## Preparing the library texts

`library/` is generated, and `tools/fetch-books.py` is what generates it:

```bash
python3 tools/fetch-books.py
```

It downloads the ten public-domain books from Project Gutenberg, drops that
project's own header and footer, and reduces what is left to something a US
keyboard can actually produce. That last part is most of the script. Gutenberg's
plain text is hard-wrapped at about seventy columns, so the lines have to be
joined back into paragraphs or every wrap would read as a paragraph break.
Curly quotes, em dashes, ellipses and accented letters are folded to ASCII —
an em dash becomes `--`, which is what the older files use anyway. `_italics_`
is markup rather than prose, so the underscores go, and so do the
`[Illustration: ...]` notes about pictures that are not here.

Each book's front matter is skipped by starting at a named heading, listed per
book in the script, because a contents page lists the same chapter titles the
body uses and only an exact match tells the two apart.

The output is `library/<id>.NNN.txt` in 32KB pieces plus `library/index.json`.
Books already present are left alone; name one to re-fetch just that one.

## Deploying

The site is served by GitHub Pages from `main`. Pages caches assets for about
ten minutes, so each game's `index.html` loads its scripts with a `?v=N` query
string — **bump `N` whenever you change a `.js` or `.css` file**, or returning
players can load new HTML against a stale script. To check a deploy in a browser
straight away, add a cache-buster to the page URL (`/?fresh=1`); a plain reload
may serve you the cached page.

## About the designs

These are original games, written from scratch, in genres established by the
arcade era. Game mechanics are not protectable, but the titles of the games that
inspired these are trademarks belonging to their owners, so they are not used
here — the genre terms *multidirectional shooter*, *formation shooter*, *city defense*,
*marble popper* and *fixed shooter* are the accurate descriptions and are what
you will find throughout.

There are no dependencies, no bundled fonts and no sound files; every game draws
to a canvas and sets type in whatever monospace font your system already has.
Blaster, Squadron 1981 and Sentinel draw all of their graphics procedurally.
Gopher vs Ants, Squadron 3030 and Bug Parade are the exceptions: they render from
the painted sheets in `burrow/images/`, `squadron3030/images/` and
`bugparade/images/`.

Squadron 3030's and Bug Parade's sheets arrive with real alpha and are simply
sliced — except that on Bug Parade's enemy sheet the four centipede heads and the
three fleas were drawn overlapping one another's bounding boxes, so those two
groups were cut out by connected component and re-laid into slots that do not
overlap before the sheet was scaled down. Gopher vs
Ants' arrive on a cream ground rather than with transparency, so `burrow/sprites.js`
keys them at load — a flood fill inward from the sheet edge,
which removes only background that is connected to the edge and therefore leaves
cream *inside* a sprite alone. A second pass converts the drop shadows the
artist painted onto the cream into real translucent shadows, so the sprites sit
on the grass instead of dragging a pale smudge around with them.

## Contributing

This is a personal project, built mainly so I have something to practice touch
typing on. It is shared in case it is useful to someone else, not as a project
looking for maintainers.

Bug reports and ideas are welcome as issues, and small fixes as pull requests,
but treat any response from me as a bonus rather than a promise. If you want to
take it somewhere I would not — different genres, different word sets, a
different feel entirely — fork it. The license exists so you can.

## License

[MIT](LICENSE). Do what you like with it, including commercially; just keep the
copyright notice, and understand that it comes with no warranty.
