# Type Arcade

Arcade games that teach you to touch type. The keyboard is the only input —
there is no aiming and no movement key. You target by typing, and the words
are the controls.

**Play: https://nscott9350.github.io/TypingGames/**

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

### Sentinel — city defence

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
call sign on its own name plate, and the plates are colour-matched to the
creature above them, so a tag says which hostile it belongs to before the word
has been read.

Thirteen designs and three capital ships share the three roles Squadron 1981
already had, one design per role per wave — so the types stay tellable apart
while the whole roster gets an outing across a run. The HUD docks into the
console printed across the foot of the background, which leaves the entire
starfield above as playfield.

### Burrow — marble popper

A column of ants marches down a garden trail toward a gopher's burrow. Typing an
ant's word sends a berry after it and the column closes the gap — and if that
brings three of a colour together they scatter too, which can cascade. Ants that
reach the burrow wear it down; when it gives out you lose one of three lives.

Only the ants nearest the burrow carry words, so targeting is never ambiguous;
the rest show only their colour, which is what you plan on. Taking the front ant
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

## How to play

| Key | Action |
| --- | --- |
| any letter | start a run, or lock onto the word beginning with that letter |
| letters | each correct letter fires a shot at your locked target |
| `Space` | *(both Squadrons)* juke aside, burning any shots you roll through; two charges |
| `Esc` | pause and open settings |
| `Q` | quit the current run (from the pause screen, press twice to confirm) |
| `M` | return to the main menu (from the summary screen) |
| `Enter` | play again (from the summary screen) |

Once you lock onto a word you must finish it before you can target anything
else, so choosing what to shoot next is part of the game. Where two targets
start with the same letter, the one closest to you wins. Chaining correct
letters builds a score multiplier up to 5x; a mistake resets it.

In both Squadrons the difficulty setting changes the rules, not just the numbers. Up
to Normal the ship steers itself around danger and each correct letter briefly
shields you. From **Hard** upward both assists are switched off and survival is
down to timing your own space-bar jukes. You carry two charges, since an attack
run is usually two threats — the diving ship, and the shot trailing about a
second behind it — and after a juke the ship holds its new position rather than
sliding back into the shot's path.

## Keyboard guide

All five games can fade a keyboard across the play field and light up the key you
need next, so you never have to glance down. It is drawn large and faint,
behind the action, and sits in the part of the screen you are already watching —
a small keyboard tucked along the bottom edge would still cost you the glance
down that the guide exists to prevent.

**Settings** offers three modes:

| Mode | Behaviour |
| --- | --- |
| **Off** | never shown (the default) |
| **When stuck** | hidden until you miss three keys in a row, then fades in until you get one right |
| **Always** | on for the whole run |

*When stuck* is the one to reach for once you know roughly where the keys are:
it stays out of the way while you are managing, and appears the moment you are
hunting — so there is nothing to lean on except when you actually need it.

Keys are colour-coded by **which finger should press them**, which is the part
that actually transfers — knowing where `P` lives is far less useful than
knowing it belongs to the right pinky. Eight lamps sit above the keyboard, one
per finger, numbered the way typing courses do it — index 1 out to pinky 4, so
the row reads `4 3 2 1 · 1 2 3 4`. Each sits over the home key its finger rests
on, and the one you need lights up in that finger's colour. The home-row keys
carry a marker too, with a heavier one under `F` and `J` for the raised bumps
you use to find home position by touch.

Press the wrong key and it is struck out in red where it sits, right beside the
key you actually wanted — so a mistake tells you which reach went astray rather
than only costing you points.

When you have no target locked, every key that would start a valid word lights
up dimly, so choosing what to shoot next is a visible decision rather than a
hunt across the screen.

## Practice word sets

All five games share the same word sets, so you can drill one part of the
keyboard and then take it into any of them. Choose in **Settings**:

- **Home row** — words using only `a s d f g h j k l`
- **Left hand** / **Right hand** — one side of the keyboard at a time
- **Common words** — the words that actually come up most when typing English
- **All words** — the full mixed vocabulary

Every target on screen is given a different starting letter, so a keypress
is never ambiguous. Narrow sets therefore cap how many targets can appear at
once — the home row only offers eight distinct starting letters, so the
Squadrons form a smaller, tighter formation on that setting.

Runs track WPM, accuracy and your best streak, and each difficulty keeps its own
top-ten table. Everything is stored locally in your browser; nothing is uploaded.

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
blaster/                Blaster (index.html, game.js, style.css)
squadron/               Squadron 1981 (index.html, game.js, style.css)
sentinel/               Sentinel (index.html, game.js, style.css)
burrow/                 Burrow (index.html, game.js, sprites.js, style.css)
burrow/images/          the painted background and sprite sheets Burrow draws from
squadron3030/           Squadron 3030 (index.html, game.js, sprites.js, style.css)
squadron3030/images/    its painted background and sprite sheets
shared/words.js         word sets, shared by all five games
shared/keyboard.js      on-screen keyboard guide, shared by all five
```

Each game keeps its own settings and high scores under its own `localStorage`
keys, so they never interfere with one another.

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
here — the genre terms *multidirectional shooter*, *formation shooter*, *city defence*
and *marble popper* are the accurate descriptions and are what you will find
throughout.

There are no dependencies, no bundled fonts and no sound files; every game draws
to a canvas and sets type in whatever monospace font your system already has.
Blaster, Squadron 1981 and Sentinel draw all of their graphics procedurally.
Burrow and Squadron 3030 are the exceptions: they render from the painted
sheets in `burrow/images/` and `squadron3030/images/`.

Squadron 3030's sheets arrive with real alpha and are simply sliced. Burrow's
arrive on a cream ground rather than with transparency, so `burrow/sprites.js`
keys them at load — a flood fill inward from the sheet edge,
which removes only background that is connected to the edge and therefore leaves
cream *inside* a sprite alone. A second pass converts the drop shadows the
artist painted onto the cream into real translucent shadows, so the sprites sit
on the grass instead of dragging a pale smudge around with them.

## Contributing

This is a personal project, built mainly so I have something to practise touch
typing on. It is shared in case it is useful to someone else, not as a project
looking for maintainers.

Bug reports and ideas are welcome as issues, and small fixes as pull requests,
but treat any response from me as a bonus rather than a promise. If you want to
take it somewhere I would not — different genres, different word sets, a
different feel entirely — fork it. The licence exists so you can.

## License

[MIT](LICENSE). Do what you like with it, including commercially; just keep the
copyright notice, and understand that it comes with no warranty.
