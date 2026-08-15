# Type Arcade

Arcade games that teach you to touch type. The keyboard is the only input —
there is no aiming and no movement key. You target by typing, and the words
are the controls.

**Play: https://nscott9350.github.io/TypingGames/**

## The games

### Type Blaster — multidirectional shooter

Rocks drift in from every edge of the screen, each carrying a word. Type a
word's first letter to lock on; your ship rotates to aim, every correct letter
fires a shot, and the rock breaks apart when the word is finished. Endless, with
the pressure ramping the longer you survive.

### Type Squadron — formation shooter

Swarms fly in along curved entry paths, settle into a formation that sways, then
peel off to dive at you and shoot. Your ship slides along the bottom of the
screen. Clear a wave to advance. Bosses can open a tractor beam that captures
your ship — type the rescue word before the timer runs out to break free.

## How to play

| Key | Action |
| --- | --- |
| any letter | start a run, or lock onto the word beginning with that letter |
| letters | each correct letter fires a shot at your locked target |
| `Space` | *(Squadron)* juke aside, burning any shots you roll through; two charges |
| `Esc` | pause and open settings |
| `Q` | quit the current run (from the pause screen, press twice to confirm) |
| `M` | return to the main menu (from the summary screen) |
| `Enter` | play again (from the summary screen) |

Once you lock onto a word you must finish it before you can target anything
else, so choosing what to shoot next is part of the game. Where two targets
start with the same letter, the one closest to you wins. Chaining correct
letters builds a score multiplier up to 5x; a mistake resets it.

In Squadron the difficulty setting changes the rules, not just the numbers. Up
to Normal the ship steers itself around danger and each correct letter briefly
shields you. From **Hard** upward both assists are switched off and survival is
down to timing your own space-bar jukes. You carry two charges, since an attack
run is usually two threats — the diving ship, and the shot trailing about a
second behind it — and after a juke the ship holds its new position rather than
sliding back into the shot's path.

## Keyboard guide

Both games can fade a keyboard across the play field and light up the key you
need next, so you never have to glance down. It is drawn large and faint,
behind the action, and sits in the part of the screen you are already watching —
a small keyboard tucked along the bottom edge would still cost you the glance
down that the guide exists to prevent. Off by default; switch it on in
**Settings**.

Keys are colour-coded by **which finger should press them**, which is the part
that actually transfers — knowing where `P` lives is far less useful than
knowing it belongs to the right pinky. Eight lamps sit above the keyboard, one
per finger, each parked over the home key that finger rests on, and the one you
need lights up in that finger's colour. The home-row keys carry a marker too,
with a heavier one under `F` and `J` for the raised bumps you use to find home
position by touch.

Press the wrong key and it is struck out in red where it sits, right beside the
key you actually wanted — so a mistake tells you which reach went astray rather
than only costing you points.

When you have no target locked, every key that would start a valid word lights
up dimly, so choosing what to shoot next is a visible decision rather than a
hunt across the screen.

## Practice word sets

Both games share the same word sets, so you can drill one part of the keyboard
and then take it into either game. Choose in **Settings**:

- **Home row** — words using only `a s d f g h j k l`
- **Left hand** / **Right hand** — one side of the keyboard at a time
- **Common words** — the words that actually come up most when typing English
- **All words** — the full mixed vocabulary

Every ship or rock on screen is given a different starting letter, so a keypress
is never ambiguous. Narrow sets therefore cap how many targets can appear at
once — the home row only offers eight distinct starting letters, so Squadron
forms a smaller, tighter formation on that setting.

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
blaster/                Type Blaster (index.html, game.js, style.css)
squadron/               Type Squadron (index.html, game.js, style.css)
shared/words.js         word sets, used by both games
shared/keyboard.js      on-screen keyboard guide, used by both games
```

Each game keeps its own settings and high scores under its own `localStorage`
keys, so the two never interfere.

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
here — the genre terms *multidirectional shooter* and *formation shooter* are
the accurate descriptions and are what you will find throughout.

Everything here is original work. There are no dependencies, no bundled fonts
or sound files, and no third-party assets of any kind — the games draw to a
canvas and set type in whatever monospace font your system already has.

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
