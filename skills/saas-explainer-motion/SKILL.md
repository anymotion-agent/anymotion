---
name: saas-explainer-motion
description: Build a broadcast-quality animated SaaS product explainer as one self-contained HTML file — Apple-style Liquid Glass UI, a deterministic seek-based motion engine, cursor-led camera moves, shape morphing, match-cut scene transitions, and procedural Web Audio sound. Use when the user wants a product explainer, demo video, launch film, feature walkthrough, landing-page hero animation, or animated UI mockup.
---

# SaaS Explainer Motion

Build product explainer films in the browser. HTML/CSS/JS in, one
self-contained file out that plays anywhere a browser does.

The engine is deterministic: every visual is a pure function of time `t`. That
single property is what separates this from a pile of CSS keyframes: you get a
scrub bar, frame-accurate arrow-key stepping, and timing you can assert on in
tests. Choreography becomes something you tune, not something you guess at.

---

## THE INPUTS THAT CHANGE THE BUILD

What each input decides, and what it costs to get wrong. Where they come from —
the request, a plan, a question — does not matter here.

**The product's website, when there is one.** The highest-value input available:
the real product name and tagline, the real feature copy, the accent colour, the
typeface, the logo, and the shape of the actual UI. A film built from the real
product beats a beautiful film about a generic dashboard.

What to take from it, in priority order:

1. **Product name and tagline**, exactly as written. Do not improve their copy.
2. **The top features in the site's own words** — these become the scenes that
   demonstrate.
3. **Accent colour**, from their CSS or logo. One hex is enough; set `--accent`
   and let the preset derive the rest.
4. **Typeface** — check their `@font-face` and `font-family`. A Google Fonts
   family you can load; a licensed face means picking the closest from the
   pairings table and saying which you substituted.
5. **The shape of the real UI** — sidebar or top nav, cards or table, light or
   dark, rounded or square.
6. **Real labels**: their actual nav items, column headers, button text, empty
   states. "Invoices / Customers / Settings" is worth ten times "Item One".
7. **Numbers**, with the attribution the site gives them. Numbers on a marketing
   site are claims, not facts. If one goes on screen, attribute it as they do.

Then **rebuild that UI out of the glass components** — `.browser-frame`,
`.sidebar`, `.row-item`, `.panel`, `.btn`. Never paste a screenshot as a flat
image: it cannot zoom, cannot respond to a cursor, cannot animate a row sliding
in, and it goes soft the moment the camera pushes in. Rebuilding is more work and
it is the entire difference between a demo and a slideshow.

Reproduce their layout and labels, simplify their density. A real app has forty
rows and nineteen nav items; the rebuild has four rows and five nav items,
because the film has to read at a glance. Keep their logo as inline SVG or a text
lockup — do not redraw it badly.

With no URL, or when fetching returns an empty JS shell, invent a plausible
product, state the assumption in one line, and build. Do not stall on it.

**Aspect ratio — settle this before writing any scenes.** `16:9` 1920×1080 is the
default and covers landing pages, YouTube and decks; `1:1` 1080×1080 square feed;
`9:16` 1080×1920 stories and Shorts; `4:5` 1080×1350 portrait feed. Positions
inside scenes are hand-placed pixels, so changing aspect afterwards means
re-laying out every scene. It is the one decision that is expensive to change
late. A 16:9 and a vertical cut are two compositions sharing one timeline, not
one file with a CSS switch.

**Where it will be watched** decides length and whether sound can be relied on. A
landing-page hero loop is short and always muted. The outer limit anywhere is
unearned attention from someone who did not choose to watch — that limit is the
real constraint, not any particular number.

**Sound.** `assets/sfx.js` synthesises everything in the browser: nothing to
license, nothing to download, and it renders offline to a reproducible WAV.
Either way the film must read correctly with sound off, because most autoplay is
muted. Sound is a layer of polish, never a carrier of meaning.

**Colour.** `data-preset="apple"` is the default: near-black, `#0A84FF` accent,
Liquid Glass panels, SF-stack type. Presets: `apple`, `light`, `midnight`,
`warm`, `mono`. Brand colours mean a hex accent and a light/dark preference.

**Typeface.** Never ship the default system stack by accident. `-apple-system` is
a deliberate choice for the Apple look, not a fallback to reach for because
nobody picked. If a typeface is named or lives in the brand, use it; otherwise
choose one that fits the product and say which and why. Pairing beats decorating:
one display face for headlines, one quiet face for body, at most. See
"Typography" for pairings and the licence trap.

**The product itself.** One sentence on what it does. The single behaviour change
you want in the viewer. Any real numbers, with sources — an unattributed stat
reads as marketing.

---

## WRITE THE BEAT SHEET BEFORE THE CODE

The beats below are the pattern that works, in the order that works. How many of
them a given film uses, and how long each runs, is a composition decision — not
something this document should make for you. What matters is the order:
problem-first, so the product arrives as relief rather than as a feature list.

| Beat | Job | Failure mode |
|------|-----|--------------|
| Hook | **Show** the pain. No narration, no headline first. | Opening on your logo |
| Stakes | One number going the wrong way. | Three numbers |
| Reveal | Hard cut. Product name + one line. | A feature list |
| How it works | The only beat with real UI. A crop, not the whole app. | The whole app |
| Payoff | It worked. Let the moment land. | Rushing past it |
| Proof | Counted numbers, attributed. | Unsourced stats |
| End card | One action. Hold long enough to read it. | Three buttons |

Rules that survive contact with real projects:

- **Show, do not tell.** Six near-identical support tickets stacking up beats
  the sentence "support teams answer repetitive questions." The repetition *is*
  the argument. The headline only names what the viewer already noticed.
- **One idea per scene.** If a scene needs two sentences to explain, it is two
  scenes.
- **Cut, do not dissolve — but a cut is not a stop.** Crossfades between scenes
  read as slideshow; hard cuts read as film. `tl.scene(...)` cuts by default.
  What carries the viewer across the cut is *motion that was already running*,
  not a fade. A scene that eases to a dead halt and then a new scene that starts
  from stillness is the single most common way an explainer feels like a
  PowerPoint. See "Continuity" below — this is the rule that most affects whether
  the film feels smooth.
- **The first 3 seconds decide everything.** Movement must begin before frame
  30. A static title card is a scroll-past.
- **Real UI beats abstract shapes** — but only a crop of it. A full app
  screenshot at 1920px wide renders every label at 11px and reads as noise.
  Sidebar + four rows + one panel is a demonstration; forty rows is a
  screenshot.
- **A cursor turns a mockup into a demo.** Move it with an arc, press, release,
  then let the UI respond one beat later. See "Cursor choreography" below.

### The one-sentence test

Before writing a beat sheet, finish this sentence:

> *After watching, a [role] should believe that [product] makes [specific task]
> [specific change], so they will [single action].*

If you cannot fill every blank, the film has no spine and no amount of motion
will give it one. Concretely:

> After watching, **a support lead at a 50-person company** should believe that
> **Relay** makes **answering repetitive tickets** **something they stop doing
> by hand**, so they will **start a trial**.

Notice what is not in that sentence: features, integrations, pricing, the
founding story. Every one of those is a thing an explainer wants to include and
almost always should not. A short film holds roughly **one** idea.

### Why problem-first

The instinct is to lead with the product. It fails because a viewer who has not
yet felt the problem has no slot to put the product into: they hear "AI-powered
support automation" and file it next to forty other tools.

Show six identical password-reset tickets stacking up and the viewer thinks
*"…that's my Tuesday."* Now the product is an answer to a question they are
already asking. The order is: **recognition → tension → relief.**

### What each beat is actually doing

**Hook.** The strongest hooks are demonstrations, not statements. A headline
reading "Support teams waste hours on repetitive tickets" is weak; six
near-identical tickets sliding into a stack, 190ms apart, each saying almost the
same thing, is strong — and *then* the headline names it. The repetition is the
argument, and the text confirms what they already spotted, which reads as
agreement rather than assertion. Let the visual land ~600ms before the words.

**Stakes.** One number, going the wrong way. "First response time: 14h." Count it
up with `tl.count()` so the viewer watches it get worse. Two numbers halves the
impact of each; three is a dashboard, and nobody feels anything about a
dashboard.

**Reveal.** Hard cut, no dissolve. The cut is the point: the problem stops, and
something else is here. A crossfade blurs the boundary the earlier beats spent
their whole length building. Product name, one line, and stillness — the hero
panel pushing in from `scale: 0.94` with a sheen sweep is enough on its own.

**How it works.** The only beat with real interface, and the one most often
ruined by showing too much. Show a crop: sidebar, four rows, one panel. Enough to
read as software, few enough that the eye knows where to look. Drive it with a
cursor — see "Cursor choreography" for the arrive / settle / press / release
sequence and the response delay that makes it read as real software.

**Payoff.** The moment the promise is kept: the draft appears, the ticket closes,
the toast confirms. Then hold. This is the most commonly rushed beat and the most
costly to rush — cutting away from it is like landing a joke and talking over the
laugh.

**Proof.** Counted numbers with `tl.count()`, and an attribution line under them.
An unattributed statistic is worse than no statistic: "3.2× faster responses"
with no source reads as marketing noise and quietly discounts everything else,
where "3.2× faster responses — internal data, 240 teams, Q2 2025" reads as a
claim someone is standing behind. Without a source, use a qualitative beat
instead. Use tabular numerals (`.tnum`) or the digits change width as they count
and the whole line wobbles.

**End card.** One action. One. "Start free trial" or "Book a demo", never both —
a viewer given two choices frequently makes neither. Hold it long enough to read
the URL, register the action, and decide.

### Pacing

**Vary beat length.** Beats of identical length are hypnotic in the bad way. A
long demonstration earns its length by carrying the argument; a short end card
feels decisive. Length follows what the beat is doing, never a template.

**Breathe after density.** A busy beat followed immediately by another busy beat
produces no memory of either. The hold after the payoff is what makes the proof
land.

**Motion should overlap, not queue.** Start the next element when the previous is
60–70% through. Strictly sequential animation with dead air between beats is the
single clearest tell of an amateur explainer.

### Copy

- **Read every line out loud.** If you run out of breath, it is too long.
- **Six to nine words per screen.** The viewer is watching motion, not reading an
  essay. Anything longer competes with the animation and loses.
- **Verbs over nouns.** "Answer 400 tickets while you sleep" beats "Automated
  ticket resolution platform."
- **Name the reader's world, not your category.** "Every password reset, handled"
  beats "AI-powered support infrastructure."
- **Numbers beat adjectives.** "14 hours" beats "slow."
- **Cut every intensifier.** Very, incredibly, seamlessly, effortlessly,
  revolutionary — each one is evidence that the noun is not carrying the claim.

### Checks before you ship

- Watch it muted. Does it still make sense?
- Watch it at 25% size. Is every word still legible?
- Watch only the first 3 seconds. Would you keep watching?
- Can you state the one idea in a sentence? Can someone else, after one view?
- Is every number sourced?
- Is there exactly one call to action?
- Does any beat contain two ideas? Split it or cut one.

---

## BUILD

Copy `assets/` into the project, then write two files: markup and timeline.

```
your-explainer/
  index.html            markup only — no animation, no inline styles for motion
  timeline.js           all timing lives here, and nowhere else
  assets/
    explainer.css       tokens, presets, glass, layout primitives
    components.css      cards, browser chrome, rows, buttons, toasts, charts
    timeline.js         the motion engine
    sfx.js              procedural Web Audio voices
```

### The load order matters

```html
<link rel="stylesheet" href="assets/explainer.css">
<link rel="stylesheet" href="assets/components.css">
...
<script src="assets/sfx.js"></script>
<script src="assets/timeline.js"></script>
<script src="timeline.js"></script>
```

`sfx.js` first — the engine's `renderAudio()` hook checks for `window.SFX` at
mount time. Your own timeline file last.

### Markup: structure only

```html
<body data-preset="apple">
  <div class="viewport"><div class="stage">
    <div class="camera" data-el="camera">          <!-- push-ins and pans go here -->
      <section class="scene" data-scene="hook">
        <div class="bg-vignette"></div>
        <div class="abs" style="left:210px; top:150px; width:940px;">
          <div class="t-display" data-el="headline">You have answered<br>this 400 times.</div>
        </div>
      </section>

      <!-- Cursor + ring: last children of .camera, OUTSIDE every scene. -->
      <div class="cursor" data-el="cursor" style="left:0; top:0; opacity:0;"></div>
      <div class="click-ring" data-el="ring" style="left:0; top:0;"></div>
    </div>
  </div></div>
</body>
```

The nesting is fixed: `.viewport` fills and clips the window, `.stage` is the
pixel coordinate space, `.camera` is the only thing you animate for frame moves,
scenes stack inside it. Skipping `.camera` means every push-in has to move each
scene child individually, which is how a film ends up with elements drifting
apart. Position in absolute pixels — never think about responsive layout. Hook
animation targets with `data-el`, not classes: classes are for styling and get
reused, `data-el` names a thing the timeline drives.

**The cursor and ring go at the end of `.camera`, never inside a scene.** Inside
a scene, the cut takes the cursor with it; inside `.camera` it survives every cut
and still scales with a push-in, the way a real screen recording would. There is
one pair for the whole film, not one per scene.

### The stage is always centred

`.stage` centres itself with a transform:

```css
position: absolute; left: 50%; top: calc(50% - var(--chrome-h, 0px) / 2);
transform: translate(-50%, -50%) scale(var(--stage-scale, 1));
```

**Do not swap that for grid/flex centring or `margin: auto`.** `transform: scale()`
shrinks what is *painted*, never what is *laid out*, so the stage's layout box
stays 1920×1080 however far it is scaled down. On any window narrower than that,
layout centring has no free space to distribute and silently no-ops — a grid
`auto` track is never shrunk below its max-content size, and CSS 2.1 §10.3.7
forces `margin-left: 0` when equal auto margins would go negative. The tell is a
film that only looks right at ~50% browser zoom; if someone reports that, this
rule is what regressed. Transform percentages resolve against the element's own
border box, so they are immune to the overflow. Write `translate` before `scale`:
CSS applies the **rightmost** function first, and reversing them scales the
centring offset too, so the film drifts further off-centre the smaller it gets.

Three properties make that hold up:

- **Centring is in CSS, not JS**, so it holds on the first paint, before `mount()`
  runs. Computed in JS, the film would sit off-centre for one frame — a visible
  jump on load and a wrong first exported frame.
- **It never scales above 1.** `fit()` clamps with `Math.min(..., 1)`. Upscaling a
  1920px canvas on a 4K monitor blurs text and glass edges. Letterboxing looks
  deliberate; soft type looks broken.
- **The scrub bar overlays the letterbox**, not the frame. `fit()` *measures* the
  bar and publishes `--chrome-h`, which is the number `top` subtracts half of — so
  CSS and JS agree and the film stays optically centred above the bar.

`fit()` re-runs on `resize`, `orientationchange`, `visualViewport` resize (browser
zoom and OS display scaling do not always fire `resize`), after
`document.fonts.ready`, and once more after the bar exists so it can measure
instead of estimate.

### Setting the aspect ratio

Set it in two places, and keep them in agreement:

```html
<html lang="en" data-preset="apple" data-aspect="9:16">
```
```js
var tl = new Timeline({ duration: 24000, fps: 60, width: 1080, height: 1920 });
```

`data-aspect` swaps the canvas size **and steps the type scale down** — 104px hero
type that reads at 1920 wide is absurd on a 1080-wide vertical frame. Presets:
`16:9` (default), `1:1`, `9:16`, `4:5`.

The Timeline dimensions are the source of truth for export; `data-aspect` exists
so the canvas is right on first paint. If the two disagree, `mount()` warns in the
console and the export follows the Timeline — otherwise a mismatch gives you a
correctly-centred preview and a wrongly-cropped video.

Vertical is not a re-crop. Rework the layout: stack instead of placing
side-by-side, drop from ~940px-wide text blocks to ~880px, and keep the 80px safe
area — vertical UI chrome eats the top and bottom of a 9:16 frame.

**Never put a CSS `transition` or `@keyframes` on anything the timeline
animates.** The browser clock and the timeline clock are different clocks. Under
frame-by-frame export the CSS clock does not advance, so those properties freeze
at their initial value while everything around them moves. This is the single
most common way to produce a broken export. Continuous ambient motion goes in
`tl.loop(fn)`, which is a function of `t` and stays seekable.

### Timeline: the whole film in one file

```js
(function () {
  var SCENES = {
    hook:   [0,     5200],   stakes: [5200,  5200],
    reveal: [10400, 4600],   how:    [15000, 10000],
    payoff: [25000, 4000],   proof:  [29000, 5000],
    end:    [34000, 3000]
  };
  var CUT = { fade: 0 };
  var tl = new Timeline({ duration: 37000, fps: 60, width: 1920, height: 1080 });

  /* ---- S1 hook ---- */
  var s = tl.scene('hook', SCENES.hook[0], SCENES.hook[1], CUT);
  s.set('[data-el="q"]', { opacity: 0, y: 26 });
  s.add('[data-el="q"]', {
    at: 300, dur: 620, ease: 'outExpo', stagger: 190,
    opacity: [0, 1], y: [26, 0]
  });
  s.cue('pop', 300);

  tl.mount();
}());
```

Keep `SCENES` as the only place scene times are written. Moving a scene then
means editing one number instead of hunting through 400 lines of offsets.

---

## API

### `new Timeline({ duration, fps, width, height })`
Defaults: 30000, 60, 1920, 1080. `duration` is ms and is authoritative — the
exporter derives frame count from it.

### `tl.add(target, cfg)`
`target` is a selector string, an element, a NodeList, or an array.

```js
tl.add('[data-el="card"]', {
  at: 1200,            // ms, absolute (or scene-relative via scene helper)
  dur: 640,            // default 480
  ease: 'outExpo',     // name, cubic-bezier(...) string, or function
  stagger: 90,         // ms between elements
  staggerFrom: 'start',// 'start' | 'end' | 'center' | 'edges' | 'random'
  origin: '50% 100%',  // sets transformOrigin
  opacity: [0, 1],
  y: [30, 0],
  scale: [0.96, 1]
});
```

Every other key is treated as an animatable property, written `[from, to]`.

**Use multi-keyframe tracks — they are the difference between motion that reads
as designed and motion that reads as a transition.** A two-value tween can only
go from A to B. Real motion anticipates, overshoots, and settles, and that needs
three or more keyframes on one track:

```js
tl.add('[data-el="badge"]', {
  at: 2000, dur: 900, ease: 'linear',
  scale:   [0.94, 1.06, 1],          // anticipate -> overshoot -> settle
  y:       [24, -6, 0],
  times:   [0, 0.42, 1],             // where each key lands, 0..1
  easeEach: 'outCubic'               // shapes every segment
});
```

- **N values** — any array longer than 2 is a keyframe track. Two-value arrays
  take an untouched fast path, so existing films pay nothing.
- **`times`** — offsets in 0..1, one per keyframe. Must start at 0, end at 1, and
  never decrease; malformed input warns and falls back to even spacing. Omit it
  and keys are spaced evenly. Repeat an offset (`[0, 0.5, 0.5, 1]`) for a hard
  cut — a value that snaps on a beat with no tween.
- **`easeEach`** — an ease applied *inside* each segment. `ease` still shapes the
  track's global progress, so the two compose. Start with `ease: 'linear'` plus
  `easeEach` when you want each leg to feel individually weighted.
- Still a pure function of `t` — keyframe tracks scrub and export like anything
  else.

Where to reach for it: overshoot on a badge or toggle, a card that lifts then
lands, a value that flashes brighter mid-count, a cursor that arcs rather than
sliding straight. If you find yourself chaining two `add()` calls back to back on
the same property, that is a keyframe track asking to be written.

- **Transform shorthands** compose into one transform string: `x`, `y`, `z`,
  `scale`, `scaleX`, `scaleY`, `rotate`, `rotateX`, `rotateY`, `skewX`, `skewY`.
- **Filter shorthands** compose into one filter string: `blur`, `brightness`,
  `saturate`, `contrast`, `grayscale`, `hueRotate`.
- **CSS variables** work: `'--glow': [0, 1]`.
- **Colours** interpolate through rgba — hex, `rgb()`, and `rgba()` all parse.
- **Unit strings** keep their unit: `width: ['0px', '100px']`.

Because transforms compose, two separate records can animate `x` and `scale` on
the same element without clobbering each other. If an element is centred in CSS
with `translate(-50%,-50%)`, put that in `data-base-transform` on the element
and the engine will prefix it instead of overwriting it.

### `tl.set(target, props)`
Instant pose at t=0 — a zero-duration record, so it still participates in
composition and cannot be clobbered by later transform writes. Use it to
establish the rest state before anything animates.

### `tl.scene(name, start, dur, opts)`
Registers a time range and returns a scoped helper. Root element is
`[data-scene="<name>"]` unless you pass `opts.root`.

- **`opts.fade`** — defaults to **0, a hard cut**. Pass a duration only where
  you want a real dissolve (or an opening fade up from black). A dissolve
  between two scenes that share no element just reads as mush.
- **`opts.overlay`** — the scene is a layer that outlives the cuts (a persistent
  HUD, a lower-third, a progress bar). Overlays are excluded from the cut chain
  and painted above everything.

The helper exposes **`add`, `set`, `cue`, `q`, `root`, `start`, `dur`, `end`**.
Times passed to it are scene-relative. Note it does **not** proxy `type`,
`count`, or `draw` — call those on `tl` with absolute times, e.g.
`tl.count(el, { at: s.start + 400, ... })`.

#### A scene's range and its paint window are two different things

This distinction is the whole reason cuts are clean, so it is worth stating
plainly. Scene **ranges deliberately overlap** — that is what keeps a tween
running across the cut instead of easing to a dead halt (see "Continuity"). But
only **one** scene may be *painted* at a time. `.scene` elements are absolutely
positioned siblings with no opaque background of their own, so if two are
painted at once the outgoing scene's content shows straight through the incoming
one for the length of the overlap.

So the engine derives a **paint window** per scene: a scene stops being painted
the frame the next non-overlay scene starts, even if its own range runs longer.
With `fade`, the window is extended to cover the incoming scene's fade so the
two genuinely cross-dissolve. Scenes are also z-ranked by start time, so a later
scene paints above an earlier one regardless of DOM order.

You do not have to do anything to get this — declare overlapping ranges as the
Continuity section shows and the cut lands on one frame. **The symptom if this
ever regresses is elements from the previous scene lingering for a second or two
into the next one.** The windows are resolved lazily and cached, so scenes may
be declared in any order.

Scenes also get `display:none` outside their paint window. That is a performance
decision with a visual payoff: offscreen glass panels with `backdrop-filter`
are expensive enough to cost frames during export.

### `tl.point(target, opts)`
The stage-space coordinate of an element — the same 1920×1080 space every
hand-written `left`/`top` in the markup uses. `opts` accepts `align`
(`'center'` default, or `'left'`/`'right'`/`'top'`/`'bottom'`) and `dx`/`dy`
nudges. Returns `{ x, y, w, h }`.

Read from **layout** via an `offsetParent` walk, deliberately not from
`getBoundingClientRect`: the stage is transform-scaled to fit the window and the
camera adds its own transform, both of which a rect folds in. Layout offsets
ignore both, so the number is stable at every window size and under any camera
move. Use it to aim the camera too — `camTo(tl.point('[data-el="x"]'), 1.8)`
beats re-deriving the same arithmetic by hand.

One caveat: layout position is the element's **unanimated** position. Point at
something the timeline moves and you get where it started. Aim at stable
geometry — a button, a row, a card.

### `tl.cursorTo(target, cfg)`
The whole click gesture aimed at an element: bowed travel, settle, press,
release, and the ring bloom. `cfg` accepts `at`, `travel` (620), `settle` (120),
`press` (90), `release` (220), `latency` (110), `bow`, `click: false` to travel
without clicking, `from: {x, y}` to override the start, plus `align`/`dx`/`dy`
passed through to `point`.

Returns the timing marks — **`arriveAt`, `pressAt`, `releaseAt`, `respondAt`,
`endAt`, `point`** — so the UI's reaction hangs off the click instead of a
guessed number. Consecutive calls chain from wherever the last one left the
cursor. Expects one `[data-el="cursor"]` and one `[data-el="ring"]` at the end
of `.camera`; override with `cfg.cursor`/`cfg.ring`. See "Cursor choreography".

### `tl.count(target, cfg)`
`{ at, dur, from, to, decimals, prefix, suffix, separator, ease }`.
Put `.tnum` (tabular numerals) on the element or the digits change width as they
count and the whole line wobbles.

### `tl.type(target, cfg)`
`{ at, dur, text, ease, caret }`. Reads `textContent` if `text` is omitted.
Caret blinks at 1.06Hz derived from `t`, so it never desyncs on export. Give the
container a fixed width or reflow will shove the surrounding layout on every
character.

### `tl.morph(target, cfg)`
Shape morph by structural interpolation. `{ at, dur, ease, stagger, times,
easeEach }` plus **one** of `d` (SVG path data), `points` (polyline/polygon), or
`clipPath` (a CSS `clip-path` value) holding an array of two or more shapes.

```js
tl.morph('[data-el="icon"] path', {
  at: 1200, dur: 520, ease: 'inOutCubic',
  d: ['M0 0 L24 0 L24 24 L0 24 Z', 'M0 0 L24 0 L12 24 L12 24 Z']
});
```

`d` and `points` are written as **attributes**; `clipPath` as a style. Three or
more shapes become a keyframe track, so `times` and `easeEach` apply as they do
on `tl.add`.

**Throws** if two consecutive shapes do not correspond — same commands in the
same order, same coordinate count. That is deliberate; see "Shape morphing" for
why a silent fallback would be worse, and for how to match two shapes using
degenerate points.

### `tl.draw(target, cfg)`
SVG stroke draw-on. `{ at, dur, stagger, ease }`. Measures each path with
`getTotalLength()` and animates `stroke-dashoffset`. Paths need a stroke and no
`stroke-dasharray` of their own.

### `tl.loop(fn)`
`fn(t)` runs every frame with absolute time. For ambient drift, shimmer, and
anything continuous. Must be a pure function of `t`.

### `tl.cue(name, at, opts)`
Records an audio cue as **data**, not a side effect. The same list drives live
playback and the offline WAV render. `opts` accepts `{ gain, pitch, i }`.

### `tl.seek(ms)` / `tl.play()` / `tl.pause()` / `tl.sceneAt(t)`
`seek` is the contract. It clamps to `[0, duration]` and is idempotent.

### `tl.mount({ controls })`
Wires up preview controls (space = play/pause, arrows = ±1 frame, `,`/`.` =
±1s, click-drag the scrub bar) and publishes `window.__EXPLAINER__`:

```js
{ version, ready, duration, fps, width, height, frames,
  seek(ms), seekFrame(f), cues, timeline, renderAudio(sampleRate) }
```

`ready` flips true only after `document.fonts.ready`. The exporter waits on it,
because frame 1 rendered in a fallback face has different metrics from every
frame after it.

**The controls never reach the export.** `mount()` reads `?render` off the URL,
which the renderer always appends, and in render mode it does not build the bar
at all — there is nothing to hide because nothing was made. `--chrome-h` is 0 in
that mode, so the film centres in the whole frame rather than in the space above
a bar. Pass `controls: false` to suppress the bar in a normal preview too.

Anything you add outside `.stage` is preview furniture and will be stripped from
the capture whether or not you mark it. Put film content inside `.stage`.

### Easing

Easing is where motion acquires personality. The rule that covers most cases:
**things arrive on an ease-out, leave on an ease-in.** An entrance on `outExpo`
starts fast and decelerates into place — purposeful, like it was thrown and
caught. The same entrance on `inOutCubic` starts slow, and slow starts read as
hesitant.

| Ease | Curve | Use |
|---|---|---|
| `outExpo` | .16, 1, .30, 1 | Hero entrances. Most decisive curve here. |
| `outQuint` | .22, 1, .36, 1 | Workhorse. When unsure, this. |
| `outQuart` | .25, 1, .50, 1 | Slightly softer entrance. |
| `outCubic` | .33, 1, .68, 1 | Small system moves, cursor travel. |
| `outCirc` | 0, .55, .45, 1 | Mechanical, linear-ish lead-in. |
| `outBack` | .34, 1.56, .64, 1 | Overshoots ~1.1. Small elements only. |
| `softLand` | .05, .70, .10, 1 | Long, luxurious settle. Hero panels. |
| `standard` | .20, 0, 0, 1 | Material 3 standard. Neutral. |
| `inExpo` | .70, 0, .84, 0 | Rip off-frame. |
| `inCubic` | .32, 0, .67, 0 | Gentle exit. |
| `inOutCubic` | .65, 0, .35, 1 | A→B moves, camera pans. |
| `inOutQuint` | .83, 0, .17, 1 | Whip pan, snap between states. |
| `uiOut` / `uiInOut` | — | In-frame product UI only. |
| `spring` family | — | Physical settle with real overshoot. |
| `linear` | — | Loops, spinners, typewriters. Nothing else. |

Also available: `inQuart`, `inOutQuart`, `inOutCirc`, `steps(n)`,
`bezier(a,b,c,d)`, `makeSpring({stiffness, damping, mass})`.

**`outBack` warning.** The overshoot is charming on a 44px badge and absurd on a
900px panel — large elements overshooting look like they broke. Scale the misuse
threshold with element size.

**`linear` warning.** Linear motion does not exist in the physical world; every
object accelerates and decelerates. Linear on a moving element is the most
recognisable amateur tell in motion design. It is correct only for continuous
loops, where there is no start or stop to shape.

**Springs.** `spring`, `springSoft`, `springSnappy`, or `makeSpring(...)`. These
are a closed-form damped oscillator evaluated as a function of `t`, so they stay
seekable — but they settle asymptotically. The engine normalises them to reach
exactly 1.0 at the end of the duration, so give a spring 500ms+ or you truncate
the interesting part.

Unknown ease names silently fall back to `outQuint`. Typos degrade rather than
throw, which is friendlier at 2am but means a misspelled ease looks *almost*
right — check the name if a move feels generic.

---

## Timing: two clocks

The most useful idea in this document. Explainer motion is **not** UI motion, and
using UI timings in a film is the fastest way to make it feel cheap.

**UI clock** — what a real interface does, for a user who is *waiting*:

| Move | Duration |
|---|---|
| Hover / focus ring | 100–150ms |
| Button press | 90ms |
| Button release | 200ms |
| Toggle, checkbox | 200–250ms |
| Tooltip, small reveal | 250–400ms |
| Dropdown, popover | 300–400ms |

**Film clock** — what reads on screen, for a viewer who is *watching*:

| Move | Duration |
|---|---|
| Small element entrance | 400–600ms |
| Card / row entrance | 500–900ms |
| Panel, modal, device frame | 700–1000ms |
| Hero headline, logo lockup | 800–1200ms |
| Camera push / scene move | 1000–1400ms |
| Counter run-up | 1200–1800ms |
| Hold after motion stops | 600–900ms |

Film runs **1.5–2.5× slower** than the same move in a shipping app.

The reason is eye travel. When something appears at the other side of a 1920px
frame, the viewer's gaze needs 200–300ms just to arrive. Animate the entrance in
250ms and it is over before they are looking at it — they register a flicker, not
a movement. The film feels twitchy and they cannot say why.

The exception is **product UI inside the frame**. When a fake cursor clicks a fake
button, that button must respond on the UI clock, because the viewer knows what
software feels like. Use the `--ui-*` tokens there, film timings everywhere else.

### Stagger

60–120ms between elements. Under 50ms reads as simultaneous and you lose the
sense of sequence; over 200ms and the last item feels forgotten.

`staggerFrom` changes the read entirely:

- `start` — a list filling in. Default, and right most of the time.
- `end` — reverse; useful when the eye should finish at the top.
- `center` — outward from the middle. Good for symmetric layouts.
- `edges` — inward to the middle. Converging, focusing.
- `random` — seeded, reproducible. For organic scatter — but random order
  destroys any sense of reading direction, so avoid it on text.

```js
s.add('[data-el="row"]', {
  at: 300, dur: 620, ease: 'outExpo',
  stagger: 90, staggerFrom: 'start',
  opacity: [0, 1], y: [26, 0]
});
```

### Overlap, do not queue

The single highest-leverage pacing habit. Start the next beat while the previous
is 60–70% complete:

```js
s.add('[data-el="card"]',  { at: 400, dur: 700, ... });
s.add('[data-el="label"]', { at: 400 + 700 * 0.65, dur: 500, ... });
```

Queued animation — each beat starting only after the last finishes — leaves dead
air between every move. It is the difference between a sentence and a list of
words.

### Compound moves

One element, several properties, different durations. This is what separates
motion that feels designed from motion that feels tweened:

```js
s.add(hero, { at: 0, dur: 1000, ease: 'softLand', y: [40, 0] });
s.add(hero, { at: 0, dur: 700,  ease: 'outQuart', opacity: [0, 1] });
s.add(hero, { at: 0, dur: 1200, ease: 'outExpo',  scale: [0.94, 1] });
```

Opacity finishes first, position next, scale last. The element is fully visible
while still settling — exactly how a physical object behaves. Because transforms
compose, these three records coexist without clobbering each other.

### Anticipation and secondary motion

A small counter-move before the main one: a card that dips 4px before rising
reads as *gathering itself*. Used sparingly it is delightful; used on everything
it becomes a nervous tic. Reserve it for the single most important move.

When a panel moves, its contents should lag 40–80ms behind the parent. Everything
arriving in perfect lockstep looks like a printed image being slid around rather
than a scene with depth.

### Holds

Dead air is a feature. 600–900ms of stillness before a cut. A cut landing the
instant motion stops feels clipped, and the viewer never gets to *look* at the
thing you spent a second revealing.

---

## Cursor choreography

The thing that turns a mockup into a demonstration. Get the order right:

1. **Travel** along a bowed path. Straight-line cursor movement is unmistakably
   robotic. 500–700ms.
2. **Settle** ~120ms before pressing. A cursor that arrives and clicks in the
   same frame reads as a script, because it is.
3. **Press** — cursor `scale` 1 → 0.88 over 90ms.
4. **Release** — 0.88 → 1 over 220ms, plus the click ring: `scale` 0.4 → 1.9
   with `opacity` 0.55 → 0.
5. **UI responds one beat later**, 80–140ms after the press. Instant response
   reads as fake; real software has latency.

### Aim at elements, never at numbers

**Do not hand-write cursor coordinates.** Arithmetic like *frame at (160,88) +
browser bar 46 + sidebar 232 + topbar 62 + pad 22* is correct exactly once: the
next time anyone nudges the frame or adds a nav item, every click in the film
lands somewhere slightly wrong. It never looks like a bug, it just looks sloppy —
the cursor presses two pixels off a button edge and the ring blooms beside it.

`tl.cursorTo()` takes an **element** and derives the coordinates, so they stay
correct when the layout moves:

```js
/* Whole click: travel, settle, press, release, ring. Returns the timing marks
   so you can hang the UI's reaction off them instead of guessing. */
const c = tl.cursorTo('[data-el="send-btn"]', { at: s.start + 6300 });

tl.add('[data-el="send-btn"]', { at: c.pressAt, dur: 110, ease: 'outCubic',
                                 scale: [1.04, 0.96] });
tl.cue('click', c.pressAt, { gain: 1.15 });
/* c.respondAt already includes the latency beat — use it, do not re-add one. */
tl.add('[data-el="draft-card"]', { at: c.respondAt, dur: 620, ease: 'inCubic',
                                   opacity: [1, 0], y: [0, -22] });
```

Marks it returns: **`arriveAt`, `pressAt`, `releaseAt`, `respondAt`, `endAt`**,
plus **`point`** (`{x, y}`) if you need the coordinate for a camera move —
`camTo(c.point.x, c.point.y, 1.8)` zooms exactly where the cursor is going.

Consecutive calls chain: each one continues from wherever the last click left
the cursor, so a three-stop sequence is three lines. `tl.point(target)` gives you
just the coordinate — useful for aiming the camera at something the cursor never
visits. Both accept `align` (`center` default, or `left`/`right`/`top`/`bottom`)
and `dx`/`dy` nudges.

Coordinates are read from the **layout** (an `offsetParent` walk), not from
`getBoundingClientRect`. That matters: the stage is transform-scaled to fit the
window and the camera adds its own transform, both of which `getBoundingClientRect`
folds in — so rect-derived coordinates would change with window size and break
under a camera push-in. Layout offsets are immune to both.

### The hotspot contract

The engine writes the **same** x/y to the cursor and to the click ring. Each
element is therefore responsible for landing *its own hotspot* on that one
coordinate.

The arrow does it with geometry instead of arithmetic. Its path is authored so
the **tip sits on `(0,0)`** — the element's own top-left corner — so `left`/`top`
alone put the tip exactly on the coordinate and `.cursor` needs **no margin
correction at all**. `transform-origin: 0 0` then makes the press scale happen
*about the tip*, so the arrow stays planted on the target rather than sliding off
it as it shrinks. Because the tip sits on the box corner, the rule also sets
`overflow: visible`; otherwise the stroke on that corner would be clipped by the
viewBox.

The click ring is round, so it centres itself the only way a circle can:
`margin: -23px 0 0 -23px`, half its own 46px width. Both elements then agree on
the same point.

Get this wrong and the ring blooms a few pixels beside the tip. It never looks
like a bug — it just looks sloppy. If you draw your own pointer, keep the same
contract: tip at the path origin, `transform-origin` on the tip, no margin.

Chained tweens like press-then-release are exactly what the engine's precedence
rule exists to support. See "Precedence" below.

### This is the pointer inside the film, not the viewer's

Be clear about which cursor this section is about. It is **the arrow drawn into
the explainer** — a prop in the film, like the browser chrome or the fake
sidebar. It lives in the film's own coordinate space, it moves on the timeline,
and it renders into the exported frames. It has nothing to do with the pointer
the viewer is pushing around their desk; that one is *hidden* over the stage so
there is never a second arrow in frame.

Hidden, but not unconditionally — and this is the part that is easy to get
wrong. `.stage { cursor: none }` on its own makes the viewer's pointer vanish
the instant it crosses the preview, so they cannot find their way back to the
scrub bar and the preview feels broken rather than clean. The stage keeps
`cursor: default` and `mount()` adds `body.cursor-idle` only when the film is
playing *and* the mouse has been still for ~1.4s; any movement, click or
keypress removes it again. A paused film always shows the real pointer. The
scrub bar sits outside `.stage` and keeps a normal pointer throughout.

Two consequences worth stating, because both are easy to get backwards:

- The in-film pointer is **not** styled with the CSS `cursor` property. That
  property can only ever change the viewer's real pointer, which is invisible
  here. The in-film pointer is an element you position, tween, and export.
- It must therefore be **art-directed like every other prop**. A crisp white
  system arrow is the single fastest way to make a product film look like a
  screen recording of somebody's laptop.

### Always an arrow. Vary the styling, never the shape

**The in-film pointer is an arrow in every film.** A dot, disc, or ring is
ambiguous about *what* it is pointing at — the entire job of this element is to
say "this control, right here", and only a tip does that. A disc hovering over a
button leaves the viewer deciding whether it means the button, the label, or the
row; an arrow tip removes the question.

So what changes between films is the **styling**, never the silhouette. The base
`.cursor` rule owns the geometry — height from `--cursor-size`, width derived
from the path aspect (`0.709`) so a size change can never squash it, tip at the
origin. Four variants restyle it and touch nothing dimensional:

| Class | Read | Use it when |
|---|---|---|
| `.cursor` | Solid fill, dark rim | Default. Legible over anything. |
| `.cursor--glass` | Translucent body, bright rim | Liquid Glass scenes on a dark preset. |
| `.cursor--accent` | Filled with the brand colour | The cursor is the subject of the shot. |
| `.cursor--outline` | Hollow, drawn in the accent | The UI underneath must stay readable through it. |
| `.cursor--soft` | Rounded silhouette, no visible rim | Friendlier, consumer-facing films. |

Pick one per film and stay with it. A pointer that changes costume mid-film reads
as an accident, not a choice.

`.cursor--soft` is the one with a trick in it: `paint-order: stroke` lays a fat
round-joined stroke *underneath* the fill, which is what rounds the polygon's
corners off. The stroke colour therefore has to match the fill, or the rounding
shows up as a halo.

Colour comes from `--cursor-*` tokens, and `--cursor-core` derives from
`--accent`, so **every preset themes its own arrow with no per-preset block**.
The light preset is the exception and overrides them deliberately: a white arrow
on `#F5F5F7` is invisible, so the fill inverts to near-black and the rim flips
light, because there the rim's job is separating a dark arrow from a light
background rather than the reverse.

Two more constraints that are not obvious:

- **Put the cursor markup as the last children of `.camera`, outside every
  scene.** Inside a scene, the cut takes the cursor with it — it vanishes at the
  boundary. Inside `.camera`, it scales with a push-in the way a real pointer
  would.
- **The cursor must not use `backdrop-filter`.** A scene mid-dissolve has
  `opacity < 1`, which makes it a backdrop root, and any `backdrop-filter` inside
  silently goes flat. The arrow uses `drop-shadow` instead — which is also what
  keeps it legible over a light card and a dark hero alike.

### The camera follows the cursor

**Wherever the cursor goes, the camera goes.** This is what makes a UI scene feel
like someone is being shown something rather than a slideshow of crops. The
viewer's attention is already on the cursor; moving the frame with it means they
never have to hunt for what changed.

The move: as the cursor travels to a component, push in on that component and
shift the frame toward it — left, right, up, or down, whichever direction that
component sits. Then hold while the interaction happens, then pull back out
before the next beat.

Animate `.camera`, never `.stage` and never the scene's children:

```js
/* Zoom to a point. The camera's transform-origin is the stage centre, so to
   bring a point to the centre you translate by the vector from the point to the
   centre — MULTIPLIED BY THE SCALE.

   The engine writes `translate3d(...) scale(...)`, and in CSS the rightmost
   function applies first: the point is scaled about the centre before it is
   translated. So the naive `x: cx - px` undershoots badly — at scale 2.4 it
   leaves the target ~950px off centre on a 1920x1080 stage. Verified
   numerically, not derived by eye. */
const CX = 960, CY = 540;                  // stage centre for 16:9
function camTo(px, py, s) {                // target point, zoom factor
  return { x: s * (CX - px), y: s * (CY - py), scale: s };
}

const near = camTo(320, 760, 1.7);         // the lower-left button
tl.add('.camera', {
  at: cursorArrivesAt - 260,               // camera LEADS the cursor slightly
  dur: 900, ease: 'inOutCubic',
  x: [0, near.x], y: [0, near.y], scale: [1, near.scale]
});
/* ...interaction happens at this zoom... */
tl.add('.camera', {                        // pull back out before the next beat
  at: interactionEnds + 120, dur: 1000, ease: 'inOutCubic',
  x: [near.x, 0], y: [near.y, 0], scale: [near.scale, 1]
});
```

Craft rules:

- **Start the camera ~200–300ms before the cursor arrives** and let it keep
  settling after. Camera and cursor moving in perfect lockstep reads mechanical;
  a slight lead reads like anticipation.
- **`inOutCubic` for camera moves.** A camera has mass — it accelerates and
  decelerates. `outExpo` is right for a UI element snapping in, wrong for a frame
  move, which is why the token comment calls `inOutCubic` the camera ease.
- **1.4×–2.2× is the useful zoom range.** Past ~2.5× on a 1920 stage, text
  rasterises soft and glass edges get chunky.
- **Never two camera moves at once.** One push per beat. If two things need
  attention simultaneously, that is two scenes.
- **Do not zoom in and out on the same component twice.** Push in, do the work,
  pull out, move on.
- **Keep the target off dead centre by a little.** Framing a button at exactly
  the centre looks like a diagram; 40–80px off looks composed.
- **Glass survives a camera transform** — `transform` on an ancestor does not
  create a backdrop root. `opacity`, `filter`, `mask`, and `clip-path` do. So
  never fade or filter `.camera`; move and scale it freely.
- `prefers-reduced-motion` already neutralises `.camera` in CSS, so a
  camera-heavy film degrades to static crops rather than breaking.

---

## Continuity: scenes connect, nothing comes to a stop

**A SaaS explainer is one continuous move, not seven animations played in
sequence.** The most common failure — and the one that separates an explainer
that feels expensive from one that feels templated — is every scene easing to a
complete halt, a beat of dead air, then the next scene starting from zero.
Nothing on screen should ever fully stop until the end card.

Six techniques, in order of how much they buy you:

**1. Overlap the scenes.** Scene ranges are allowed to overlap. Let the outgoing
scene's last motion still be resolving while the incoming scene's first element
is already moving:

```js
const hook   = tl.scene('hook',   0,    5200);              // fade: 0 is default
const stakes = tl.scene('stakes', 4900, 5400);              // 300ms overlap
```

The overlap is a **timing** overlap, not a painting one. `hook`'s tweens keep
resolving through 4900–5200 — which is the point, nothing eases to a halt — but
`hook` stops being *painted* on the frame `stakes` begins. If both were painted,
the outgoing scene would show through the incoming one, since scenes are
absolutely positioned siblings with no opaque background. The engine handles
this; see "A scene's range and its paint window" in the API section.

**2. Never end a scene on a dead ease.** If a scene's last tween finishes 400ms
before the cut, those 400ms are dead air. Either extend the tween so it is still
settling at the cut, or give the scene a slow ambient drift that runs through it.

**3. Carry a continuous element across the cut.** One thing that persists —
the camera at a shared scale, an aurora bloom mid-drift, a panel that is the same
size and position in both scenes — stitches two scenes into one move. The viewer
reads it as the same world.

**4. Match motion direction across the cut.** If the outgoing scene's last
movement travels left, start the incoming scene's first movement travelling left
too. Reversing direction at a cut is a visual full stop.

**5. Use `tl.loop` for ambient life.** A slow aurora drift, a shimmer, a gentle
float — continuous, pure functions of `t`, running underneath everything and
never stopping. This is what fills the gaps between deliberate beats.

```js
tl.loop((t) => {
  const el = document.querySelector('[data-el="aurora"]');
  el.style.setProperty('--gx', (50 + 14 * Math.sin(t / 5200)) + '%');
});
```

**6. Hand off momentum.** The outgoing scene's exit and the incoming scene's
entrance should share an ease family and a rough speed. An element leaving on
`inCubic` at 500ms pairs with one arriving on `outCubic` at 600ms; pairing a
900ms `outExpo` exit with a 200ms `uiOut` entrance reads as a jolt.

Two things that are *not* continuity: crossfading every cut (that is a
slideshow), and animating everything all the time (that is noise). Continuity
means the film never comes to rest — not that every element is always moving.
Pick one or two things to carry momentum and let the rest hold still.

**How to check it.** Scrub slowly through each cut with the arrow keys, one frame
at a time. At the exact cut frame and the four frames either side, something
should be mid-motion. If every element is at a rest value across all five frames,
you have found a dead stop — fix it before moving on.

### The match cut: carry one element across the boundary

The strongest transition in the kit, and the one that most reliably reads as
expensive. Instead of ending scene A and starting scene B, you let **one element
keep its geometry across the cut** and let everything else change around it. The
eye locks onto the thing that persisted and never has to re-find the subject, so
two scenes read as one continuous move.

Concretely: a metric card sitting at 640×220 in the upper left of scene A appears
at exactly 640×220 in the upper left of scene B, and then travels to its new
position. The viewer reads it as the same card being carried, not as two cards.

```js
/* Scene A leaves the card mid-travel; scene B picks it up from the SAME place
   and finishes the move. The numbers at the boundary must agree exactly — this
   is the one place in a film where hand-matched values are the technique
   rather than a smell. */
const HANDOFF = { x: 180, y: -60, scale: 0.92 };

a.add('[data-el="card"]', { at: 4200, dur: 900, ease: 'inOutCubic',
                            x: [0, HANDOFF.x], y: [0, HANDOFF.y],
                            scale: [1, HANDOFF.scale] });
b.set('[data-el="card-b"]', HANDOFF);              /* same pose, new scene */
b.add('[data-el="card-b"]', { at: 0, dur: 800, ease: 'outQuint',
                              x: [HANDOFF.x, 0], y: [HANDOFF.y, 0],
                              scale: [HANDOFF.scale, 1] });
```

A shared constant is doing the real work here. If you write the handoff pose
twice by hand, the two will drift the first time anyone adjusts the layout, and a
match cut that is off by 6px is worse than no match cut — the element visibly
jumps at the boundary, which draws attention to exactly the seam you were hiding.

**On FLIP.** In app UI the standard way to do this is FLIP — measure the element's
**F**irst position, move it to its **L**ast, **I**nvert the delta with a transform
so it *appears* not to have moved, then **P**lay the transform back to zero. The
reason it exists is that transforms are cheap where animating `width`/`height`/
`top`/`left` forces layout on every frame.

Here you get FLIP's benefit without FLIP's machinery, and you should. FLIP
measures at runtime with `getBoundingClientRect`, which (a) reads back layout
mid-frame and (b) folds in the stage fit scale and the camera transform — so the
numbers would change with window size and break under a push-in. A film has a
fixed 1920×1080 canvas and a known layout, so the delta is a **constant you can
write down**. Animate transforms from a shared constant and you have FLIP's
performance profile and none of its measurement fragility.

### Choosing the transition

| Transition | When |
|---|---|
| **Hard cut** | The default, and it should be most of them. Nothing to say between two beats — just say the next one. |
| **Match cut** | The subject continues into the next scene. The best option whenever it is available. |
| **Cross-dissolve** | Sparingly: a time skip, or a mood change. Two per film is a lot. |
| **Whip pan** | Two scenes that are physically adjacent — a camera move with a hard direction, `inOutQuint`, 260–420ms. Sells "over here now". |
| **Wipe** | Almost never in a SaaS explainer. Reads as a slide template. |

**Why crossfading every cut hurts twice.** It reads as a slideshow, because a
dissolve says "unrelated image now" — and separately, a scene at `opacity < 1`
becomes a **backdrop root**, so every `backdrop-filter` inside it goes flat for
the duration of the fade. Your glass panels quietly turn into grey rectangles at
exactly the moment the viewer is looking at the transition. This is why `fade`
defaults to `0`. If you want a dissolve, fade the scene's *contents*, not the
scene.

### Faking speed without motion blur

There is no compositor doing motion blur here, so speed has to be implied:

- **Pair the eases.** Something leaving frame goes on `inExpo` — it accelerates
  away and is gone. Something arriving comes in on `outExpo` — it decelerates
  into place. Using the same ease for both directions is what makes moves read as
  mechanical.
- **Stretch along the direction of travel.** A brief `scaleX` of 1.06 on a fast
  horizontal move reads as speed, not distortion, as long as it recovers.
- **Scale-through.** Rather than sliding a panel off, push it *past* the camera:
  scale up to ~1.4 while fading. The viewer reads it as the frame moving, which
  is a stronger continuity cue than a slide.
- **Trails.** A duplicate of the moving element at 15–20% opacity, following
  60–90ms behind, is a poor man's motion blur and works better than it should on
  a single fast move. One per film.

### One caution about change blindness

A hard cut hides changes. That is usually the point — but it also means a change
the viewer was *supposed* to notice can vanish into the cut, because the visual
disruption masks it. If the whole beat is "look, the number went up", do not
change it across a cut. Change it **on screen**, in one continuous shot, with the
camera already on it. Reveals need continuity; only transitions need cuts.

---

## Precedence (read this before debugging a stuck element)

Records use **fill-both** semantics: before a record starts it holds its `from`,
after it ends it holds its `to`. Per property, per element, the winner is:

1. A record that has **started** (`t >= start`) beats one that has not.
2. Among started records, the **last inserted** wins — so you can layer.
3. Among pending records, the **first** wins — so the earliest record supplies
   the initial pose and later ones stay out of the way.

Rule 3 is why the press/release chain works:

```js
tl.add(cursor, { at: 2500, dur: 90,  scale: [1, 0.88] });
tl.add(cursor, { at: 2590, dur: 220, scale: [0.88, 1] });
```

Under naive last-write-wins, the release record's `from` value of 0.88 would fill
*backwards* and pin the cursor at 0.88 from t=0 — permanently pressed until it
un-presses. Rule 3 lets the first record own the rest pose until the second
actually starts. If an element is stuck at a value it should not reach until
later, this is almost always why: check whether an earlier record is supposed to
own that property's rest state, and add a `tl.set()` if none does.

The authoring test suite asserts this and 52 other properties, including that
`seek(t)` produces byte-identical output whether reached forward, backward, or
cold, and that keyframe tracks hit every key. Run it after touching the engine.

---

## The deterministic clock

The architectural decision everything else depends on: **every visual is a pure
function of `t`.** No stateful animation, no browser-driven timing, no accumulated
deltas.

```js
tl.seek(12500);   // frame at 12.5s — identical every time, from any prior state
```

- **Export works.** The renderer calls `seek(frame * 1000/fps)` and screenshots.
  Nothing drifts, because nothing accumulates.
- **Scrubbing works.** Drag the bar backwards and the film is correct at every
  position.
- **It is testable.** The suite asserts that seeking forward, backward, and cold
  to the same `t` produce byte-identical style strings.

The consequence you must respect: **no CSS `transition` or `@keyframes` on
anything the timeline animates.** Under frame-by-frame export the browser clock
does not advance — the renderer seeks, screenshots, seeks, screenshots. A CSS
transition needs wall-clock time to progress, so it never does. The property
freezes at its initial value while everything driven by `seek()` moves correctly
around it. This produces the most confusing bug in the whole system: perfect in
preview, broken in the export, with no error anywhere.

For continuous ambient motion use `tl.loop(fn)`, which receives `t`:

```js
tl.loop(function (t) {
  var drift = Math.sin(t / 4200) * 14;
  aurora.style.transform = 'translate3d(' + drift + 'px, 0, 0) scale(1.06)';
});
```

Same visual result as a CSS animation, but seekable and exportable.

---

## Performance

At 1920×1080 and 60fps you have 16.6ms per frame in preview. Export is not
real-time so it cannot drop frames, but a slow frame still multiplies: 2200
frames × 200ms is over seven minutes of rendering.

- **Animate `transform` and `opacity`.** They are compositor properties.
  Animating `top`, `left`, `width`, or `height` triggers layout every frame,
  roughly an order of magnitude more expensive.
- **`backdrop-filter` is the expensive one.** Each glass panel forces a backdrop
  snapshot and blur per frame. Three to five on screen at once is fine; twenty is
  not. This is why scenes get `display:none` outside their range — offscreen glass
  still costs.
- **`will-change` sparingly.** It promotes an element to its own layer, which
  helps a handful and hurts across fifty. It also creates a backdrop root, which
  will flatten glass inside it.
- **`filter: blur()` on large elements** is costly; prefer a pre-blurred gradient
  background where you can.
- Use `--from/--to` in the renderer to iterate on one scene rather than
  re-rendering the whole film to check a three-second change.

---

## Tells: cheap vs premium

What separates a template explainer from a considered one, in rough order of
impact:

| Cheap | Premium |
|---|---|
| Everything at one duration | Durations vary with element size and importance |
| Linear or default easing | Deliberate curves, ease-out for entrances |
| Sequential, queued beats | Overlapping, 60–70% handoff |
| Motion never stops | Holds after key beats |
| Elements move in lockstep | Secondary motion, 40–80ms lag |
| Crossfades between scenes | Hard cuts |
| UI-speed timings | Film-clock timings |
| Cursor teleports in straight lines | Arcs, settles, press/release, delayed UI |
| Instant UI response to clicks | 80–140ms latency, like real software |
| One shadow, hard | Layered, low-opacity, large-radius shadows |
| Text at 16px | 24px+ minimum |
| Unattributed statistics | Sourced, dated claims |

The common thread: **premium motion has a point of view about what matters.**
Cheap motion animates everything equally because no decision was made about
hierarchy. If every element enters the same way at the same speed, you have told
the viewer nothing about what to look at.

---

## Typography

**Do not ship the default font stack unless the user asked for the Apple system
look.** The presets ship `-apple-system` because that *is* the Apple look and it
is the honest default for `data-preset="apple"`. Everywhere else it is the visual
equivalent of leaving the placeholder text in: nothing is wrong, and nothing is
chosen. A film set in the system UI face looks like a screenshot of software. A
film with a considered display face looks like it was made.

Pick type the way you would pick a voice for the product:

| Character | Display | Body | Reads as |
|---|---|---|---|
| Editorial, premium | Instrument Serif, Playfair Display | Inter | Considered, expensive, human |
| Technical, developer | Space Grotesk, Archivo | Inter, IBM Plex Sans | Precise, built by engineers |
| Swiss, neutral | Inter Tight, Archivo | Inter | Clean, corporate, safe |
| Warm, approachable | Bricolage Grotesque, Fraunces | Inter | Friendly, small-team |
| Infrastructure | IBM Plex Mono, JetBrains Mono | IBM Plex Sans | Low-level, serious |
| Apple system | `-apple-system` stack | same | Native, platform-honest |

Override the tokens rather than editing rules — every utility class reads from
them, so three lines restyles the whole film:

```css
:root {
  --font-display: "Instrument Serif", Georgia, serif;
  --font-text:    "Inter", -apple-system, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;
}
```

Craft rules that matter more than the choice itself:

- **One display face, one text face.** Three faces reads as indecision. Weight
  and size give you all the hierarchy you need.
- **Tracking tightens as size grows.** The `--track-*` tokens already do this.
  If you bring in a new display face, check its tracking at hero size — most
  need less negative tracking than SF Pro Display, and serifs often need none.
- **Line height falls as size grows.** 1.03 at hero, ~1.5 at body.
- **Numbers that animate need `.tnum`.** Without tabular figures a counter
  wobbles its own line.

Two traps that cost real time:

- **A webfont that fails to load exports differently than it previews.**
  `document.fonts.ready` resolves when loading *finishes*, including when it
  finishes by failing — so the ready gate does not prove the face arrived. If the
  export machine has no network, a Google Fonts `<link>` silently falls back and
  every metric shifts. For anything you will export, self-host a woff2 next to
  the HTML and `@font-face` it locally. I have not been able to render-verify this
  in this environment (no Chrome available), so treat it as reasoned from the
  spec, not measured.
- **Licences.** Google Fonts families listed above are OFL or Apache-2.0 and fine
  to embed and distribute. A foundry face usually is not — check before shipping
  a woff2 inside a file the client will host.

---

## Icons

**Use icons.** A row of labelled glass cards with no icons reads as a wireframe.
Icons are how a viewer parses a feature grid in the 1.5 seconds it is on screen,
and they give small elements something to animate that is not just a fade.

Where they earn their place: feature rows and grids, empty states, toolbars and
sidebars in a mocked UI, status indicators (a check that draws on beats a green
dot), step markers in a process, and metric cards where the icon carries the
category so the label can stay short.

Rules that keep a set looking like a set:

- **One grid, one weight.** Pick a 24px-grid stroke set and stay in it. Mixing a
  24px stroke icon with a 16px filled one is the fastest way to look assembled
  rather than designed. Lucide (ISC), Feather (MIT), Phosphor (MIT), Heroicons
  (MIT) and Tabler (MIT) are all permissive; verify the licence file before you
  ship, and do not mix two sets in one film.
- **Inline the SVG.** No `<img>`, no icon font. Inline paths are the only form
  the engine can animate, and they inherit `currentColor`.
- **`<use>` hides paths from the engine.** A `<symbol>` instantiated with `<use>`
  clones into a shadow tree, so `document.querySelectorAll` cannot reach the
  cloned `<path>` — which means `tl.draw()` finds nothing to measure and silently
  does nothing. If you want stroke draw-on, paste the real `<path>` into the
  scene. `<use>` is fine for icons you only fade, move, or scale.
- **Scale about the centre.** SVG children need `transform-box: fill-box` before
  `transform-origin: center` behaves the way it does on HTML elements.
- **Stroke weight at size.** A 24px icon with `stroke-width: 2` blown up to 120px
  has a 10px stroke and looks like a cartoon. Either drop `stroke-width` to
  ~1.25 as you scale up, or set `vector-effect: non-scaling-stroke` to hold the
  visual weight. Decide per shot: matched weight across a row of icons usually
  wants `non-scaling-stroke`, a single hero icon usually wants the hand-tuned
  value.

How to animate them, in rough order of usefulness:

```js
// Draw-on — the icon builds itself. Needs a real inline <path> with a stroke.
tl.draw('[data-el="feature-icon"] path', { at: 1400, dur: 620, stagger: 90 });

// Pop-in with overshoot — a keyframe track, not two chained tweens.
tl.add('[data-el="check"]', {
  at: 2200, dur: 620, ease: 'linear',
  scale: [0.6, 1.08, 1], opacity: [0, 1, 1], times: [0, 0.55, 1],
  easeEach: 'outCubic'
});
```

Stagger a row by 70–110ms so the eye reads it left to right instead of taking
the whole row as one flash.

---

## Shape morphing

A morph is one shape becoming another *as a continuous body* — a square settling
into a circle, a play triangle folding into two pause bars, a hamburger
straightening into an X. Done well it is the strongest continuity device in the
kit, because the viewer never loses track of the object. Done badly it is a
lurching blob, and a blob is worse than a cut.

### Only morph when it is the same object

**The rule that decides whether to morph at all:** morph when the two shapes are
*the same thing in two states*. Play → pause is the same control. A card
expanding into a panel is the same surface. A chevron flipping is the same
affordance.

Do **not** morph between unrelated objects. An envelope becoming a rocket is a
party trick — it reads as surreal, the viewer spends the whole beat decoding the
intermediate frames instead of listening, and the intermediate frames are
meaningless because there is no object that is half-envelope. Cross-fade
unrelated things, or cut. Reserve the morph for identity.

The companion rule is about the in-between frames: **every intermediate frame
must read as a plausible silhouette.** The viewer sees all of them. If frame 8
of 30 is an ambiguous lump, the morph reads as a rendering glitch even though
the endpoints are perfect. Scrub to the middle and look at it — 0.5 progress is
where morphs die.

### Why naive `d` interpolation fails

You cannot blend two path strings by blending their text. Three separate
problems, and they compound:

**1. Mismatched command counts.** One path has 4 commands, the other has 11.
There is no pairwise correspondence at all, so there is nothing to interpolate.

**2. Mismatched command types.** `L` (2 numbers) against `C` (6 numbers) do not
even have the same arity. Blending `L10 0` with `C1 1 2 2 3 3` is not a shape.
This is why the standard preprocessing step in every real morphing library is to
**convert every command to a cubic Bézier** (`C`): a cubic can express a line by
putting its control points on the line, and can approximate an arc in a few
segments, so once everything is cubic the arities match by construction.

**3. Start point and winding direction.** Even with matched counts and types,
the two paths may begin at different vertices, so the morph includes a spurious
rotation as the start point travels around the perimeter. And if one path winds
clockwise while the other winds counter-clockwise, the shape turns **inside
out** halfway through. Libraries solve this by testing rotation offsets and
choosing the one that minimises total point travel — GSAP's MorphSVG exposes
exactly this as `shapeIndex`, and the parameter exists because the automatic
search is O(n²) in point count and sometimes picks wrong.

### What this engine does, and what it refuses to do

There is **no path-normalization library bundled here**, deliberately: the film
is one self-contained file and a normalizer is a large dependency to carry for an
effect used two or three times. Instead the engine does **structural
interpolation** — if two values have the same non-numeric skeleton and the same
count of numbers, it lerps the numbers pairwise and pours them back in.

That single rule covers `d`, `points`, `clip-path: polygon()`, gradient stops,
`box-shadow`, and `viewBox`, with no per-property special case. It means the
normalization burden moves to **you, at authoring time**: draw the two shapes so
they already correspond.

```js
/* Same commands, same order, same coordinate count — so this morphs. */
tl.morph('[data-el="badge"] path', {
  at: 1200, dur: 520, ease: 'inOutCubic',
  d: ['M0 0 L24 0 L24 24 L0 24 Z',
      'M0 0 L24 0 L12 24 L12 24 Z']     /* a doubled point keeps the count at 8 */
});
```

`tl.morph()` **throws on a mismatch** rather than doing something approximate.
This is on purpose: an unmatched morph degrades to a midpoint *snap*, which does
not look like an error — it looks like a one-frame glitch you will not notice
until you are stepping through the export, by which time it is in six other
scenes. The error names which pair failed and why.

The trick for making counts match is a **degenerate point**: repeat a coordinate
so it contributes to the count while occupying no visible length. `L12 24 L12 24`
above is one vertex drawn twice. This is exactly how a play triangle morphs into
two pause bars — the triangle is authored as a four-point shape with two points
coincident, so it has the same skeleton as the bars.

Formatting is normalized before comparison, so `polygon(0% 0%,100% 0%)` and
`polygon(0% 0%, 100% 0%)` still morph into each other. Your whitespace habits
will never be the reason a morph silently degrades.

### Prefer the cheap thing that reads as a morph

Most "morphs" in a good explainer are not path interpolation at all. In rough
order of how often they are the right answer:

- **Transform-based icon morphs.** A hamburger→X is three rects with `rotate`
  and `translate`; the middle one fades. A chevron flip is `rotate(180deg)`.
  A plus→check is two strokes rotating. These are cheap, GPU-friendly, never
  produce an ambiguous silhouette, and are what most shipped icon animations
  actually are.
- **`clip-path: polygon()`** with matching vertex counts. Geometric UI
  transitions — a rectangle shearing into a trapezoid — for nearly free.
- **`border-radius`** to round a square into a circle. One property.
- **Draw-on** with `stroke-dashoffset` (`tl.draw`) when the shape should *build*
  rather than transform.
- **Cross-fade plus a small scale** between two SVGs. When the shapes are too
  different to correspond, this is the honest answer, and at 200–300ms with a
  slight scale the eye reads it as a transformation anyway.
- **Masked wipe** — one shape revealed over another.

### The gooey / metaball filter

For blobs that merge and separate — loaders, a cluster of avatars coalescing —
the classic SVG filter is a heavy blur followed by an alpha contrast crush:

```xml
<filter id="gooey">
  <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
  <feColorMatrix in="blur" mode="matrix"
    values="1 0 0 0  0
            0 1 0 0  0
            0 0 1 0  0
            0 0 0 18 -7"/>
</filter>
```

Only the last row matters: it computes `A' = 18A − 7`. The blur turns two
separate shapes into two overlapping soft clouds; multiplying alpha by 18 and
subtracting 7 crushes that soft ramp back to nearly binary, so mid-range alpha
where the clouds overlap snaps to opaque and the outer halo snaps to
transparent. The result is a single body with a sticky, liquid boundary. Push the
multiplier up (19/−9, 20/−10) for a tighter, more aggressive merge.

The filter is passive — you animate the *positions* of the shapes as pure
functions of `t` and the filter does the rest, so this is fully compatible with
seeking.

### Cost

Recomputing a path every frame is main-thread work, and `will-change` does not
help because path geometry is not a compositable property. Keep morphing paths
under roughly 50 points and it is negligible; a few hundred points is worth
measuring. If a complex morph plays repeatedly, the right answer is usually to
simplify the shape rather than optimise the interpolation.

### What does not work here, and why

Several standard morphing techniques are incompatible with a deterministic
seek-based render, because they run on the *browser's* clock rather than on `t`:

| Technique | Usable? |
|---|---|
| Structural interpolation via `tl.morph` | **Yes** — pure function of `t`. |
| flubber / polymorph / d3-interpolate-path | **Yes** — they return `t => pathString`, so build the interpolator at setup and call it inside `tl.loop`. |
| CSS `transition` on `d` or `clip-path` | **No** — time-based; cannot be seeked. |
| SMIL `<animate attributeName="d">` | **No** — runs on the browser's timeline. |
| View Transitions API | **No** — driven by the browser's animation clock, not scrubbable frame by frame. |
| GSAP MorphSVG / KUTE | Only via their own progress APIs, and they are dependencies this file avoids. |

If you do want real normalization, **flubber** is the one to vendor: it is
dependency-free and its `interpolate(a, b, {maxSegmentLength})` returns a plain
`t => d` function, which drops straight into `tl.loop` without violating
anything. That is a deliberate choice to make per film, not a default.

---

## Gradients, glow, and photos

Flat fills are what make a dark film look cheap. Depth comes from a very small
number of soft light sources — never a busy gradient.

- **`.bg-aurora`** — the ambient mesh: two or three wide, low-opacity radial
  blooms. This is the workhorse background. Drift it with `tl.loop` at a scale
  where the movement is felt rather than seen.
- **Accent glow behind the hero.** A single large radial in the accent colour
  behind a glass panel does more for perceived quality than any edge treatment.
- **`.t-grad`** — gradient text, for one phrase per film. Two is a pattern; three
  is a template.
- **Grain over every gradient.** `.grain` at 2–5%. Browser gradients band on dark
  backgrounds, and banding is the single clearest tell that something was made in
  CSS rather than graded.
- **Animate gradients by driving a custom property**, never with `@keyframes` — a
  CSS animation freezes under frame-by-frame export because the CSS clock does
  not advance between seeks. The engine writes CSS variables, so this works and
  stays deterministic:

```css
.bg-aurora { background: radial-gradient(40% 44% at var(--gx) 30%, ...); }
```
```js
tl.add('[data-el="aurora"]', { at: 0, dur: 8000, ease: 'inOutCubic',
                               '--gx': ['22%', '68%'] });
```

Photos, when the product needs them (people, hardware, real screenshots):

- **Always put a scrim between a photo and text.** A dark gradient over the image
  under the text — not lowered image opacity, which greys the whole frame.
  Contrast against the *composited* result is what the viewer sees; run
  the contrast of a token pair if you are unsure — do not eyeball it.
- **Grade toward the palette.** A raw stock photo fights an Apple-dark film. Push
  it toward the accent with a duotone or a low-saturation overlay so it belongs.
- **Never fade a wrapper that contains glass.** Any ancestor with `opacity < 1`
  becomes a backdrop root and the glass inside goes flat — see the backdrop-root
  trap below. Fade the image, not the container.
- Motion for photos is slow: a 4–6% scale over several seconds. Anything faster
  reads as a slideshow.

---

## Liquid Glass

Apple's material, introduced at WWDC 2025 for iOS 26 / macOS 26. Three properties
define it, and the common misreading — "frosted glass", a blur behind a
translucent panel — captures only the second of them.

**Refraction.** A blur *averages* what is behind the panel; refraction
*displaces* it. Light bends through the material, so straight lines behind the
edge visibly kink and offset. No blur radius at any strength reproduces that,
because blurring and bending are different operations.

**Specular.** Real glass catches light on its edges and surface: a bright rim
along the top edge, a dimmer one along the bottom, and a broad soft sheen across
the surface.

**Adaptive.** The material samples what is behind it and shifts its own contrast
so foreground content stays legible over both a white page and a photograph.

### The seven-layer stack

Back to front, as `explainer.css` implements it. Every layer does work; dropping
one is why most attempts look like a grey rectangle.

1. **Refraction** — `backdrop-filter: url(#lens)`, an SVG displacement map
2. **Blur + vibrancy** — `blur()` plus `saturate()`
3. **Translucent fill** — `var(--glass-fill)`
4. **Inner depth** — inset shadow giving the panel thickness
5. **Rim highlight** — bright inset line on the top edge, dim on the bottom
6. **Specular sheen** — a wide, soft diagonal gradient
7. **Grain** — 3–5% noise

You get all seven from the `.glass` class; the tokens below are what a preset
varies. Do not rewrite this stack by hand — the alphas are measured.

```css
.glass {
  position: relative;
  isolation: isolate;
  border-radius: var(--r-xl);
  background: var(--glass-fill);
  backdrop-filter: blur(8px) saturate(1.8) brightness(1.12) contrast(1.05);
  box-shadow:
    inset 1.5px 1.5px 0 rgba(255,255,255,.50),  /* lit bevel: 0 blur is key */
    inset 0 0 0 1px rgba(255,255,255,.15),      /* hairline containment     */
    inset 0 0 12px rgba(255,255,255,.18),       /* diffuse internal glow    */
    inset 0  1px 1px rgba(255,255,255,.55),     /* directional rim, top     */
    inset 0 -1px 1px rgba(255,255,255,.28),     /* bottom                   */
    inset  1px 0 1px rgba(255,255,255,.20),     /* sides                    */
    inset -1px 0 1px rgba(255,255,255,.20),
    0 8px 32px rgba(0,0,0,.22);                 /* canonical cast shadow    */
  contain: paint;
}
```

**Why each layer matters.** Drop the `saturate` and it looks like grey plastic —
vibrancy is the single most recognisable part of the effect, as colour behind the
panel blooms through it; `1.5–1.8` is the useful range and above 2.0 turns
garish. Drop the rim highlight and it looks painted on rather than physical, because
the rim is what tells the eye there is an edge with thickness. Drop the grain and
large panels band visibly — especially under video compression, where smooth
gradients are exactly what codecs destroy; 3–5% noise also reads as filmic.
Replace the layered shadow with a single hard one and the panel looks pasted onto
the background instead of floating above it.

**Behind body text, use `.glass-solid`** — it walks blur up to 24px and drops the
brightness lift, because refraction and a low blur both cost legibility. Apple
walked blur up in the iOS 26 betas for exactly this reason.

### The rim gradient technique

A single `box-shadow: inset` gives a uniform rim. Real glass catches light
directionally. `.glass::after` already implements a gradient rim that follows the
border radius, using mask compositing (credit: Temani Afif):

```css
.glass::after {
  content: ""; position: absolute; inset: 0;
  border-radius: inherit;
  padding: 1px;                          /* padding IS the border width */
  background: linear-gradient(145deg,
    rgba(255,255,255,.70) 0%,  rgba(255,255,255,.12) 38%,
    rgba(255,255,255,.04) 62%, rgba(255,255,255,.42) 100%);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;               /* -webkit-mask-composite: xor */
}
```

Two identical masks, one clipped to the content box, excluded from each other —
leaving only the 1px padding ring. The gradient paints just that ring, following
the border radius exactly. Brightest top-left, second highlight bottom-right, so
the panel reads as catching light from one direction.

You get this for free with `.glass`; it is documented because it is the layer
people strip out when simplifying, and its absence is what makes a panel look
painted on rather than physical.

**Note:** `mask` makes an element a backdrop root, which is exactly why this
lives on `::after` rather than on `.glass` itself. If you write your own rim,
keep it on a pseudo-element or a child — putting a mask on the glass element
flattens its own backdrop-filter.

### Tint

`.glass::before` carries a colour wash driven by `--glass-tint` (0 by default)
and `--glass-hue`. It is a range of tones rather than a flat fill, matching
Apple's coloured-glass model. Drive `--glass-tint` from 0 to ~.18 on the timeline
to "charge" a panel with colour as a beat lands.

### Refraction

`templates/glass-filters.svg`, pasted as the **first child of `<body>`**. It must
be inline in the same document — `backdrop-filter: url(#lens)` will not resolve
against an external file or an `<img>`.

How the filter works:

1. `feTurbulence` with a low `baseFrequency` (0.008–0.012) generates smooth
   organic noise — the "surface irregularity" of the glass
2. `feGaussianBlur` smooths it further into gentle gradients
3. `feComponentTransfer` with a steep slope pushes it toward a usable normal map
4. A rim mask derived from blurred `SourceAlpha` concentrates displacement at the
   **edges**, because that is where real refraction is strongest — the centre of
   a flat pane barely bends light at all
5. `feDisplacementMap` uses that as offsets into the backdrop

`.glass-lens` applies it, blurring both before and after the displacement:
pre-blur softens the source, post-blur hides `feDisplacementMap`'s lack of
supersampling. Three strengths ship:

| Filter | Scale | Use |
|---|---|---|
| `#lens-soft` | 8 | Behind body text — refraction costs legibility |
| `#lens` | 18 | General panels |
| `#lens-strong` | 34 | Hero shots only |

Plus `#grain-fine` for standalone grain with no displacement.

#### Honest caveats

- **Chromium only.** Firefox and Safari ignore `url()` in `backdrop-filter`. The
  `@supports` guard drops them to the blur stack, which still reads as glass.
- **The rim follows the border box, not `border-radius`.** Corners get slightly
  less lensing than they should. Invisible at video scale; do not build a
  close-up hero on one corner.
- **Unverified under headless capture.** No Chrome could be installed in the
  authoring sandbox, so whether the headless compositor rasterises `url()`
  backdrop-filters identically to headed mode is untested. If exported frames
  show flat glass, try `--swiftshader`; if that fails, drop `.glass-lens` and
  keep `.glass`.

### Animating glass

**The sheen sweep** — the signature hero move. A diagonal highlight crossing the
panel once:

```js
s.add('[data-el="hero-sheen"]', {
  at: 300, dur: 1100, ease: 'inOutCubic', x: [-420, 1420]
});
```

Once. Not on a loop. A repeating sheen is a loading skeleton, and viewers read it
as "still waiting" rather than "premium material."

**Push-in on reveal** — `scale: [0.94, 1]` over 1000ms with `softLand`, plus a
`y` drift. Because `opacity` must live on the glass element and not the wrapper,
split the records as shown under the backdrop-root trap below.

**Never animate `backdrop-filter` blur radius.** Every frame forces a fresh
backdrop snapshot at a new radius, which is expensive enough to visibly stall
export. Animate the fill opacity instead — visually similar, dramatically
cheaper.

### Presets

Five ship, all sharing motion tokens, radii, and type scale — a preset is a
colour and material decision, not a different design system. A film should not
re-time itself because the client picked a light theme.

| Preset | Character | For |
|---|---|---|
| `apple` | Near-black, `#0A84FF`, generous space | Default |
| `light` | `#F5F5F7`, deeper blue, dark rims | Embedding in white pages |
| `midnight` | Deep violet-black, `#6E7BFF` | Security, infra, developer tools |
| `warm` | Warm black, amber `#FF9F0A` | Fintech, commerce, creator tools |
| `mono` | Pure black, white-only accents | Editorial, typographic |

```html
<body data-preset="midnight">
```

Override a single accent without leaving the preset:

```html
<body data-preset="apple" style="--accent:#FF6B35">
```

Each preset redefines `--glass-blur`, `--glass-sat`, `--glass-fill` and
`--glass-fill-dim`; everything else about the material is shared.

**Light-mode glass is not inverted dark glass.** The mistake is flipping
background and foreground and stopping there. On a light background the rim goes
**dark** — a white rim on white is invisible, so `--glass-edge` becomes
`rgba(0,0,0,0.10)`. Fill goes **up**, not down: `rgba(255,255,255,0.60)` rather
than `0.10`. Shadows carry the elevation, since the highlight no longer can. And
secondary text needs more weight — Apple's own light-mode secondary label is ~0.60
alpha, which measures 3.50:1 on `#F5F5F7`, below the 4.5:1 body minimum. The same
0.60 white on near-black lands at 7.37:1, which is why dark presets get away with
it. `light` uses 0.75 (4.92:1), measured rather than eyeballed.

The contrast suite parses the real CSS and audits all five presets against WCAG
AA. Run it after touching any colour token.

Glass needs something behind it worth refracting. Over a flat fill it looks like
a slightly lighter rectangle — the whole effect is a function of the backdrop, so
build the background first.

### Grain

Large soft gradients under a blur band visibly on any 8-bit display — stepped
rings where the gradient should be smooth, and the most common tell that a dark
gradient was made in a browser rather than graded. Video codecs make it worse,
because smooth gradients are exactly what they destroy. A fine noise overlay
breaks up the steps and reads as physical material rather than a vector:

```css
.grain {
  position: absolute; inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: var(--grain);            /* 2–5%. Higher looks dirty. */
  background-image: url("data:image/svg+xml,…feTurbulence baseFrequency='.85'…");
}
```

Keep it inside the glass element, not on an ancestor — see the backdrop-root trap
below. For grain over something that is not a glass panel, use the `#grain-fine`
filter instead.

`@media (prefers-reduced-transparency: reduce)` drops `backdrop-filter` on
`.glass` and `.glass-solid` to opaque fills, matching Apple's Reduce Transparency.

### The backdrop-root trap

The most costly bug in this system, because it fails silently and only sometimes.

`backdrop-filter` samples the nearest **backdrop root**. An ancestor becomes one
if it has any of:

- `opacity` less than 1
- `filter`
- `mask` or `clip-path`
- `will-change` on any of the above
- `transform` in some compositing paths

When that happens the glass samples an empty layer and renders flat. No error, no
warning, and if the ancestor's opacity is animated it breaks only in the frames
where opacity is mid-tween — so the panel flickers between glass and grey and you
cannot reproduce it by pausing.

**The rule: animate `transform` on the wrapper, `opacity` on the glass element
itself.**

```js
/* WRONG — wrapper opacity flattens the glass inside it */
s.add('[data-el="hero-wrap"]', { opacity: [0, 1], y: [40, 0] });

/* RIGHT — transform on the wrapper, opacity on the glass */
s.add('[data-el="hero-wrap"]',  { y: [40, 0], scale: [0.94, 1] });
s.add('[data-el="hero-glass"]', { opacity: [0, 1] });
```

This is also the second reason `tl.scene()` defaults to `fade: 0`. A scene-level
opacity fade makes the scene root a backdrop root and flattens every glass panel
inside it for the duration of the fade. Hard cuts avoid the problem entirely, and
they are the better editorial choice anyway.

If a glass panel must fade, target the panel itself, never a parent.

---

## Sound

`assets/sfx.js` synthesises every sound with Web Audio. Nothing is sampled, so
there is nothing to license, nothing to download, and no 40MB of audio files in
the repo. It renders offline to a WAV via `renderAudio()`, so the soundtrack is
reproducible — the same code generates it every time. Voices: `click` `tick`
`key` `pop` `whoosh` `thump` `chime` `success` `error` `riser` `toggle` `pad`,
plus aliases `transition` `impact` `notify` `appear`.

```js
tl.cue('click', 3200);
tl.cue('key', 3400, { i: 3 });        // i = index, for per-keystroke jitter
tl.cue('chime', 5000, { gain: 0.7, pitch: 1.2 });
```

Cues are **data**, not side effects. The same array drives live playback and the
offline render, so what you approve in preview is what ships.

### What each voice is for

| Voice | Character | Use |
|---|---|---|
| `click` | Short, bright transient | Cursor press on a button |
| `tick` | Drier, quieter | Counters, small state changes, toggles off |
| `key` | Keystroke | Typewriter — pass `i` per character |
| `pop` | Soft body, no attack | Element appearing, chip added |
| `whoosh` | Filtered noise sweep | Scene transitions, camera moves |
| `thump` | Low body | Panel landing, impact, weight |
| `chime` | Tuned, pleasant | Positive confirmation |
| `success` | Chime + body | Payoff moment. Use once. |
| `error` | Dissonant, short | Failure state in the problem scene |
| `riser` | Rising noise/tone | 400–900ms *before* a reveal |
| `toggle` | Two-part click | Switch flipping |
| `pad` | Sustained tone bed | Under a whole scene at low gain |

Aliases: `transition`→whoosh, `impact`→thump, `notify`→chime, `appear`→pop.

### Mixing

- **One accent per beat.** Two cues inside 80ms muddy into a single indistinct
  click. If two things happen together, sound the more important one.
- **Layer roles, not volume.** Transient (click/tick) + body (thump/pop) + air
  (pad/riser). One voice at high gain sounds thin; three at low gain sound
  produced. A panel landing is `thump` at 0.5 plus `pop` at 0.3, not `thump` at 1.0.
- **Offset layered transients by ~10ms.** Perfectly simultaneous transients
  phase-cancel and read as one duller hit:

  ```js
  s.cue('click', 2590);                  /* transient */
  s.cue('thump', 2600, { gain: 0.4 });   /* body, 10ms later */
  ```
- **Sound follows the visual, slightly.** A cue landing 20–40ms *after* the frame
  where motion starts feels tighter than one landing exactly on it — the eye leads
  the ear.
- **Anticipation.** A `riser` starting 600ms before a reveal does more for impact
  than any accent on the reveal itself. Sound leads picture.
- **Pad for glue.** `pad` under a scene at `gain: 0.25` makes cues feel like part
  of a mix rather than isolated beeps. Silence between cues reads as broken audio.
- **Duck before accents.** Drop the pad ~200ms before a `success` or `impact` so
  the accent has room to land.
- **Gain discipline.** Accents 0.4–0.7, pads 0.2–0.3, keystrokes 0.15–0.25.
  Everything at 1.0 is the audio equivalent of everything at one duration.
- **Never `Math.random()`** for jitter — use the seeded `i`. Random breaks
  reproducibility, and a re-render that sounds different from the approved
  preview is a real problem.

### Silent-first

Most explainers play muted — in a feed, in a meeting, on a landing page. **Design
the film to work with no audio at all, then add sound as reinforcement.** If a
beat only lands because of its cue, the motion is not doing its job. Check the
whole film with audio off before you ship it.

This cuts the other way too: never put information *only* in sound. No "the chime
tells you it saved." Show it saved.

---

## Verification status, stated honestly

362 assertions pass across three suites during authoring, run against code
extracted **from this file** rather than from a working copy — so the thing that
passed is the thing that ships. Two suites are mutation-tested, which is the only
evidence that a green suite means anything: reverting the precedence fix makes
exactly the two relevant timeline assertions fail and nothing else; reverting the
scene paint-window fix fails exactly the two scene-exclusivity assertions;
reverting the cursor to a disc fails exactly three; and removing structural
interpolation, the morph skeleton guard, the per-leg morph validation, the
separator normalization, or the attribute-hold each fails exactly the assertions
that describe it. Seeding a `data-el` typo, a bad ease name, a dropped border
correction in the cursor's coordinate walk, or a swapped script tag each reports
exactly one failure naming the real cause.

Worth saying plainly, because it happened during authoring: the first versions of
four of the morph assertions **passed against deliberately broken code**. They
were testing the wrong branch — a coordinate-count check fired before the
command-type check, a mismatch was placed on a leg the validator happened to
reach first, and a midpoint sample could not distinguish a hold from a snap. An
assertion you have not tried to break is a comment.

What was **never** verified: no Chrome binary could be installed in the authoring
sandbox, so neither the demo nor the starter has been opened in a browser. The
logic is tested; the visual composition is not. Open it yourself first and expect
to nudge positions. Say this to the user rather than claiming a verified film.

---

## Accessibility and delivery

- **Captions or on-screen text for anything meaningful.** Most autoplay is
  muted; a film that needs audio to be understood is a film most people will
  not understand.
- Contrast ≥ 4.5:1 for body text over glass. Glass panels sit over moving
  backgrounds, so check the worst frame, not the first.
- No strobing, and nothing flashing more than 3×/second.
- Ship a `prefers-reduced-motion` path for embedded use. `explainer.css`
  includes the guard: it neutralises `.camera` and reduces transforms to fades.
- Text minimum 24px at 1920 wide. It will be watched at 480px in a feed.
- Keep the safe area 80px in from every edge — embeds and crops eat the rest.
- For a page embed: `autoplay` the film muted on scroll into view, and give it a
  static first frame that reads on its own in case scripts never run.
- Full WCAG conformance needs manual testing with assistive tech; the guards
  above are necessary, not sufficient.

---

## Common failures

| Symptom | Cause |
|---|---|
| Glass looks like flat grey | Backdrop root above it — an ancestor with opacity/filter/mask |
| Element frozen in export, fine in preview | CSS `transition`/`@keyframes` on an animated property |
| Element stuck at a later value from t=0 | Precedence — no earlier record owns the rest pose |
| Counter line wobbles | Missing `.tnum` |
| **Previous scene's elements linger a second or two into the next** | **A scene is being painted past its cut. Scenes are transparent absolute siblings, so two painted at once show through each other — see the paint-window note under `tl.scene`. Do not "fix" it by removing the range overlap; the overlap is what keeps motion alive across the cut** |
| **Cursor visibly disappears at a cut** | **The cursor markup is inside a scene. It belongs at the end of `.camera`, outside every scene** |
| **Cursor clicks land a few px off the control** | **Hand-written coordinates that the layout has since moved past. Use `tl.cursorTo(element)`, which derives them** |
| **Click ring blooms beside the cursor, not under it** | **Hotspot mismatch — cursor and ring get the same x/y, so each must self-offset onto its own hotspot** |
| **Cursor looks like a screen recording** | **The viewer's own OS pointer is showing through. `.stage` needs `cursor: default` plus the `body.cursor-idle` rule that hides it during playback, and the film's arrow is the `.cursor` element styled with the `--cursor-*` tokens** |
| **Viewer's pointer disappears over the preview and never comes back** | **`.stage { cursor: none }` was written unconditionally. It belongs behind `body.cursor-idle`, which mount() sets only while playing and clears on any input** |
| **Cursor is a dot, a ring, or a hand** | **It must always be an arrow. Vary it with `.cursor--glass`/`--accent`/`--outline`/`--soft`, never by changing the silhouette** |
| Cursor looks robotic | Straight-line travel; no settle before the press |
| **`tl.morph` throws "do not correspond"** | **The two shapes have different commands or different coordinate counts. Redraw the simpler one with matching points — repeat a coordinate to pad the count. This is the error working, not a bug** |
| **A shape snaps instead of morphing** | **Written through `tl.add` rather than `tl.morph`, so the mismatch degraded to a midpoint switch instead of throwing** |
| **An element jumps a few px at a match cut** | **The handoff pose is written twice and the two copies drifted. Share one constant between the outgoing and incoming tween** |
| Film feels cheap | UI-clock durations, no overlap, no holds |
| Audio differs between renders | `Math.random()` somewhere in cue jitter |
| Nothing animates | Timeline file loaded before `assets/timeline.js` |
| `no elements matched` warning | Selector typo, or querying outside a scene root |
| Film only looks right at ~50% browser zoom | Stage centring reverted to grid/flex/margin — see "The stage is always centred" |

---

## How to use this file

Everything is here: the craft guidance above, and the complete source of every
runtime file under SOURCE FILES.

Create this structure, then copy each fenced block out **verbatim**:

```
your-explainer/
  index.html            markup only — no animation, no inline motion styles
  timeline.js           all timing lives here, and nowhere else
  assets/
    explainer.css       tokens, 5 presets, glass, .camera, layout, type scale
    components.css      cards, browser chrome, rows, buttons, toasts, charts, cursor
    timeline.js         the motion engine
    sfx.js              procedural Web Audio voices
```

Do not retype or "improve" the CSS and the engine. Their comments record traps
that cost real debugging to find, and the numbers in them are measured, not
chosen — the contrast values, the glass layer alphas, and the ease curves all
have a reason.

Fastest start: copy `templates/starter.html` to `index.html` and
`templates/starter.timeline.js` to `timeline.js`. That pair is a working 3-scene
film with the camera wrapper and overlapping scenes already in place, so you edit
something alive rather than assemble something dead. Open it and press space.

---

## SOURCE FILES

Copy each block verbatim to the path in its heading.

### `assets/explainer.css`

```css
/* explainer.css — motion tokens, style presets, glass material, stage layout
   Part of the saas-explainer-motion skill.

   Design canvas is a FIXED pixel stage (default 1920x1080) that is scaled to
   fit the viewport. Every px value in your scenes is therefore absolute and
   predictable, and a headless screenshot at 1920x1080 is pixel-identical to
   what you saw in the browser. */

/* 1. MOTION TOKENS  —  the FILM clock
   Explainer motion is NOT UI motion. A viewer is watching, not waiting, so
   beats run roughly 1.5-2.5x slower than the same move inside a shipping app.
   Use these for video. Use the --ui-* set only for in-frame product UI that is
   meant to read as a real interface responding to a click. */
:root {
  /* Easing. Sourced values (easings.net / Material 3 / Core Animation).      */
  --e-out-expo:      cubic-bezier(0.16, 1, 0.30, 1);   /* hero curve          */
  --e-out-quint:     cubic-bezier(0.22, 1, 0.36, 1);   /* workhorse entrance  */
  --e-out-quart:     cubic-bezier(0.25, 1, 0.50, 1);
  --e-out-cubic:     cubic-bezier(0.33, 1, 0.68, 1);   /* small system moves  */
  --e-out-circ:      cubic-bezier(0.00, 0.55, 0.45, 1);
  --e-out-back:      cubic-bezier(0.34, 1.56, 0.64, 1);/* small elements only */
  --e-in-out-cubic:  cubic-bezier(0.65, 0, 0.35, 1);   /* A->B, camera pans   */
  --e-in-out-quint:  cubic-bezier(0.83, 0, 0.17, 1);   /* whip pan, snap      */
  --e-in-expo:       cubic-bezier(0.70, 0, 0.84, 0);   /* rip off-frame       */
  --e-in-cubic:      cubic-bezier(0.32, 0, 0.67, 0);
  --e-soft-land:     cubic-bezier(0.05, 0.70, 0.10, 1);/* M3 emph. decelerate */
  --e-standard:      cubic-bezier(0.20, 0, 0, 1);      /* M3 standard         */
  --e-linear:        linear;                            /* loops/spinners only */

  /* Duration, film clock (ms). */
  --d-tick:   120ms;   /* cursor click ring, tiny state flip                  */
  --d-micro:  200ms;   /* toggle, checkbox, badge pop                         */
  --d-fast:   320ms;   /* row highlight, tooltip, tab indicator               */
  --d-base:   480ms;   /* card enter, list item, chart bar                    */
  --d-slow:   720ms;   /* panel, modal, device frame                          */
  --d-hero:  1000ms;   /* headline, logo lockup, big reveal                   */
  --d-scene: 1400ms;   /* full scene transition, camera push                  */

  /* Interactive-UI clock, for fake product UI reacting to a fake click.      */
  --ui-fast:  150ms;
  --ui-base:  240ms;
  --ui-slow:  360ms;

  /* Stagger. Below 40ms reads simultaneous; above ~110ms reads as a queue.   */
  --stagger-tight:  40ms;
  --stagger-base:   60ms;
  --stagger-loose:  90ms;

  /* Holds — dead air is a feature. Let a reveal breathe before the next beat.*/
  --hold-short: 400ms;
  --hold-base:  800ms;
  --hold-long: 1400ms;
}

/* 2. PRESET: APPLE  (the default when the user does not specify a style)
   Dark, near-black, elevated grays, one confident accent, generous negative
   space, tight negative tracking on display type, soft multi-layer shadows. */
:root,
[data-preset="apple"] {
  --font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter",
                  "Helvetica Neue", Arial, sans-serif;
  --font-text:    -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter",
                  "Helvetica Neue", Arial, sans-serif;
  --font-mono:    ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;

  /* Tracking tightens as size grows — this is the single biggest "Apple"
     typographic tell after the typeface itself.                              */
  --track-hero:    -0.045em;
  --track-display: -0.032em;
  --track-title:   -0.021em;
  --track-body:    -0.010em;
  --track-label:    0.006em;
  --track-eyebrow:  0.085em;

  /* Type scale, tuned for a 1920x1080 canvas. */
  --fs-hero:     104px;
  --fs-display:   72px;
  --fs-title:     48px;
  --fs-headline:  34px;
  --fs-body:      24px;
  --fs-caption:   18px;
  --fs-label:     14px;

  /* Surfaces (iOS dark elevated grays). */
  --bg-base:    #000000;
  --bg-elev-1:  #1C1C1E;
  --bg-elev-2:  #2C2C2E;
  --bg-elev-3:  #3A3A3C;
  --bg-elev-4:  #48484A;
  --separator:  rgba(84, 84, 88, 0.60);

  /* Label opacities — Apple's four-step hierarchy, with label-3 nudged from
     Apple's 0.36 to 0.37 so it clears 3:1. label-3 carries real copy in a film
     (source attribution, chart titles), so it is held to the 3:1 large-text
     minimum rather than treated as decoration. label-4 is dividers and
     disabled states only — never text. Measured, not eyeballed. */
  --label-1: rgba(255, 255, 255, 0.98);
  --label-2: rgba(255, 255, 255, 0.60);
  --label-3: rgba(255, 255, 255, 0.37);
  --label-4: rgba(255, 255, 255, 0.18);

  /* Accents — iOS dark-mode system colors. */
  --accent:    #0A84FF;
  --accent-2:  #5E5CE6;
  --accent-3:  #BF5AF2;
  --accent-4:  #64D2FF;
  --ok:        #30D158;
  --warn:      #FFD60A;
  --bad:       #FF453A;
  --pink:      #FF375F;

  /* Radii. Apple uses continuous "squircle" corners; plain border-radius is
     the practical web approximation. Keep radius proportional to element size
     — a 40px radius on a 44px chip looks wrong, on a 600px card it looks right.*/
  --r-xs:   6px;
  --r-sm:  10px;
  --r-md:  14px;
  --r-lg:  20px;
  --r-xl:  28px;
  --r-2xl: 40px;
  --r-pill: 999px;

  /* Shadows — layered, low-opacity, large-radius. Never one hard shadow.     */
  --sh-1: 0 1px 2px rgba(0,0,0,.30);
  --sh-2: 0 2px 6px rgba(0,0,0,.24), 0 8px 20px rgba(0,0,0,.18);
  --sh-3: 0 4px 12px rgba(0,0,0,.26), 0 18px 44px rgba(0,0,0,.26);
  --sh-4: 0 8px 24px rgba(0,0,0,.28), 0 40px 96px rgba(0,0,0,.34);
  --sh-glow: 0 0 0 1px rgba(10,132,255,.28), 0 8px 40px rgba(10,132,255,.30);

  /* In-film cursor. This is the pointer DRAWN INTO the film, not the viewer's
     OS pointer — that one is hidden over the stage. --cursor-core derives from
     --accent so every preset themes its own arrow with no per-preset block;
     override any of these in a preset to art-direct it.

     --cursor-size is the arrow's HEIGHT. 26px on a 1920-wide stage matches the
     apparent size of a real pointer on a 1080p screen; go much bigger and the
     film reads as a cartoon, much smaller and it disappears on a phone. */
  --cursor-size:       26px;
  --cursor-fill:       rgba(255,255,255,0.86);
  --cursor-fill-solid: #fff;
  --cursor-fill-quiet: rgba(255,255,255,0.14);
  --cursor-spec:       rgba(255,255,255,0.95);
  --cursor-edge:       rgba(0,0,0,0.42);
  --cursor-core:       var(--accent);
  --cursor-halo:       color-mix(in srgb, var(--accent) 28%, transparent);

  /* Liquid Glass material knobs. */
  --glass-blur:      28px;
  --glass-sat:       180%;
  --glass-bright:    1.06;
  --glass-fill:      rgba(255,255,255,0.10);
  --glass-fill-dim:  rgba(255,255,255,0.045);
  --glass-edge:      rgba(255,255,255,0.44);
  --glass-edge-dim:  rgba(255,255,255,0.09);
  --glass-inner:     rgba(255,255,255,0.13);
  --glass-spec:      rgba(255,255,255,0.55);
  --grain:           0.035;
}

/* 2b. ALTERNATE PRESETS
   Each overrides only what changes. Motion tokens, radii, type scale and
   tracking are shared — the presets are a colour and material decision, not a
   different design system, and a film should not re-time itself because the
   client picked a light theme.

   Set on <body data-preset="light"> etc. Swap a single accent without leaving
   the preset by setting --accent inline on the same element. */

/* LIGHT — for embedding in a white page or printing stills. Glass over light
   backgrounds needs the opposite treatment: the rim goes DARK (a white rim on
   white is invisible), fill drops, and shadows carry the elevation instead of
   the highlight. This is the preset people get wrong by only flipping bg/fg. */
[data-preset="light"] {
  --bg-base:    #F5F5F7;
  --bg-elev-1:  #FFFFFF;
  --bg-elev-2:  #F0F0F2;
  --bg-elev-3:  #E4E4E7;
  --bg-elev-4:  #D4D4D8;
  --separator:  rgba(60, 60, 67, 0.18);

  /* label-2 is 0.75 here, not the 0.60 the dark presets use. Apple's own
     light-mode secondary label is ~0.60, but that measures 3.50:1 on this
     background — under the 4.5:1 body minimum. On a dark background the same
     0.60 white lands at 7.37:1, which is why the dark presets get away with
     it. Measured, not eyeballed: 0.75 -> 4.92:1. */
  /* Light mode inverts the cursor too — a white arrow on #F5F5F7 is invisible.
     Same rule as the glass rim: light-mode chrome is not dark chrome flipped.
     The rim goes light here because it now has to separate a DARK arrow from a
     light background, which is the opposite job it does on the dark presets. */
  --cursor-fill:       rgba(28,28,30,0.88);
  --cursor-fill-solid: #1C1C1E;
  --cursor-fill-quiet: rgba(28,28,30,0.12);
  --cursor-spec:       rgba(0,0,0,0.55);
  --cursor-edge:       rgba(255,255,255,0.72);

  --label-1: rgba(0, 0, 0, 0.92);
  --label-2: rgba(60, 60, 67, 0.75);
  --label-3: rgba(60, 60, 67, 0.58);
  --label-4: rgba(60, 60, 67, 0.20);

  --accent:    #007AFF;   /* iOS *light*-mode system blue — a shade deeper   */
  --accent-2:  #5856D6;
  --accent-3:  #AF52DE;
  --accent-4:  #32ADE6;
  --ok:        #34C759;
  --warn:      #FF9500;
  --bad:       #FF3B30;
  --pink:      #FF2D55;

  --sh-1: 0 1px 2px rgba(0,0,0,.06);
  --sh-2: 0 2px 6px rgba(0,0,0,.07), 0 8px 20px rgba(0,0,0,.05);
  --sh-3: 0 4px 12px rgba(0,0,0,.08), 0 18px 44px rgba(0,0,0,.07);
  --sh-4: 0 8px 24px rgba(0,0,0,.09), 0 40px 96px rgba(0,0,0,.10);
  --sh-glow: 0 0 0 1px rgba(0,122,255,.22), 0 8px 40px rgba(0,122,255,.20);

  --glass-blur:      24px;
  --glass-sat:       160%;
  --glass-bright:    1.02;
  --glass-fill:      rgba(255,255,255,0.60);
  --glass-fill-dim:  rgba(255,255,255,0.40);
  --glass-edge:      rgba(0,0,0,0.10);
  --glass-edge-dim:  rgba(0,0,0,0.05);
  --glass-inner:     rgba(255,255,255,0.90);
  --glass-spec:      rgba(255,255,255,0.95);
  --grain:           0.018;
}

/* MIDNIGHT — deeper and cooler than apple, with a violet cast. For security,
   infra, data and developer products. Blur runs higher because the backdrop is
   darker and there is less contrast to protect. */
[data-preset="midnight"] {
  --bg-base:    #06070D;
  --bg-elev-1:  #0D0F1A;
  --bg-elev-2:  #151827;
  --bg-elev-3:  #1F2337;
  --bg-elev-4:  #2C3149;
  --separator:  rgba(120, 130, 180, 0.22);

  --label-1: rgba(233, 236, 255, 0.98);
  --label-2: rgba(196, 202, 235, 0.58);
  --label-3: rgba(178, 186, 225, 0.49);
  --label-4: rgba(170, 180, 220, 0.16);

  --accent:    #6E7BFF;
  --accent-2:  #9B6BFF;
  --accent-3:  #C77DFF;
  --accent-4:  #4FD1FF;
  --ok:        #2FE0A0;
  --warn:      #FFC94D;
  --bad:       #FF5C7A;
  --pink:      #FF4D8D;

  --sh-glow: 0 0 0 1px rgba(110,123,255,.30), 0 8px 44px rgba(110,123,255,.34);

  --glass-blur:      34px;
  --glass-sat:       190%;
  --glass-fill:      rgba(150,160,255,0.075);
  --glass-fill-dim:  rgba(150,160,255,0.035);
  --glass-edge:      rgba(190,200,255,0.40);
  --glass-edge-dim:  rgba(190,200,255,0.08);
  --glass-inner:     rgba(170,180,255,0.12);
  --grain:           0.042;
}

/* WARM — near-black with a warm bias, amber accent. For fintech, commerce,
   creator tools; anywhere blue reads as generic-SaaS. Saturation is pulled
   back because warm hues bloom harder through the vibrancy filter. */
[data-preset="warm"] {
  --bg-base:    #0F0C0A;
  --bg-elev-1:  #1A1613;
  --bg-elev-2:  #241E19;
  --bg-elev-3:  #322A23;
  --bg-elev-4:  #45392F;
  --separator:  rgba(120, 100, 84, 0.42);

  --label-1: rgba(255, 250, 245, 0.98);
  --label-2: rgba(240, 228, 216, 0.58);
  --label-3: rgba(230, 216, 200, 0.42);
  --label-4: rgba(225, 210, 195, 0.17);

  --accent:    #FF9F0A;
  --accent-2:  #FF6B35;
  --accent-3:  #FFD60A;
  --accent-4:  #FFB86B;
  --ok:        #4ADE80;
  --warn:      #FFD60A;
  --bad:       #FF5A4E;
  --pink:      #FF6B8A;

  --sh-glow: 0 0 0 1px rgba(255,159,10,.26), 0 8px 40px rgba(255,159,10,.28);

  --glass-blur:      26px;
  --glass-sat:       150%;
  --glass-bright:    1.08;
  --glass-fill:      rgba(255,240,225,0.085);
  --glass-fill-dim:  rgba(255,240,225,0.04);
  --glass-edge:      rgba(255,238,220,0.42);
  --glass-edge-dim:  rgba(255,238,220,0.09);
  --glass-inner:     rgba(255,235,215,0.12);
  --grain:           0.048;
}

/* MONO — one accent, no hue variety. Editorial, high-contrast, typographic.
   Every accent token resolves to the same value on purpose: it forces the film
   to carry meaning through motion, scale and space instead of colour coding.
   Vibrancy is near-off, since there is little chroma to bloom. */
[data-preset="mono"] {
  --bg-base:    #000000;
  --bg-elev-1:  #0E0E0E;
  --bg-elev-2:  #171717;
  --bg-elev-3:  #232323;
  --bg-elev-4:  #333333;
  --separator:  rgba(255, 255, 255, 0.16);

  --label-1: rgba(255, 255, 255, 1.00);
  --label-2: rgba(255, 255, 255, 0.56);
  --label-3: rgba(255, 255, 255, 0.37);
  --label-4: rgba(255, 255, 255, 0.15);

  --accent:    #FFFFFF;
  --accent-2:  #FFFFFF;
  --accent-3:  #FFFFFF;
  --accent-4:  #FFFFFF;
  --ok:        #FFFFFF;
  --warn:      #FFFFFF;
  --bad:       #FF3B30;   /* the one exception — failure must read as failure */
  --pink:      #FFFFFF;

  --sh-glow: 0 0 0 1px rgba(255,255,255,.30), 0 8px 40px rgba(255,255,255,.14);

  --glass-blur:      30px;
  --glass-sat:       105%;
  --glass-fill:      rgba(255,255,255,0.07);
  --glass-fill-dim:  rgba(255,255,255,0.03);
  --glass-edge:      rgba(255,255,255,0.50);
  --glass-edge-dim:  rgba(255,255,255,0.10);
  --glass-inner:     rgba(255,255,255,0.11);
  --grain:           0.055;
}

/* 3. LIQUID GLASS MATERIAL
   Seven-layer stack, back to front: refraction, blur+vibrancy, translucent
   fill, inner depth, rim highlight, specular sheen, grain.

   Two variants, matching Apple's own split:
     .glass         decorative chrome. Low blur so the backdrop stays legible.
     .glass-solid   sits behind text. Heavy blur, because legibility wins.

   IMPORTANT: saturate() between 1.5 and 1.8 is the vibrancy knob. It is the
   single thing that separates Apple-looking glass from generic frosted blur.
   Cast shadow converges on 0 8px 32px rgba(0,0,0,.22) across every credible
   implementation — treat that as canonical. */
.glass {
  position: relative;
  isolation: isolate;                    /* contain the blend modes          */
  border-radius: var(--r-xl);
  background: var(--glass-fill);
  -webkit-backdrop-filter: blur(8px) saturate(1.8) brightness(1.12) contrast(1.05);
          backdrop-filter: blur(8px) saturate(1.8) brightness(1.12) contrast(1.05);
  box-shadow:
    inset 1.5px 1.5px 0 rgba(255,255,255,.50),  /* lit bevel: 0 blur is key  */
    inset 0 0 0 1px rgba(255,255,255,.15),      /* hairline containment      */
    inset 0 0 12px rgba(255,255,255,.18),       /* diffuse internal glow     */
    inset 0  1px 1px rgba(255,255,255,.55),     /* directional rim, top      */
    inset 0 -1px 1px rgba(255,255,255,.28),     /* bottom                    */
    inset  1px 0 1px rgba(255,255,255,.20),     /* sides                     */
    inset -1px 0 1px rgba(255,255,255,.20),
    0 8px 32px rgba(0,0,0,.22);                 /* canonical cast shadow     */
  contain: paint;
}

/* Behind text. Apple walked blur UP in the iOS 26 betas for exactly this. */
.glass-solid {
  -webkit-backdrop-filter: blur(24px) saturate(1.8) contrast(1.05);
          backdrop-filter: blur(24px) saturate(1.8) contrast(1.05);
  background: rgba(255,255,255,.07);
}

/* Tint. A range of tones, not a flat wash — matches Apple's colored-glass
   model. Drive --glass-tint 0 -> .18 on the timeline to "charge" the glass. */
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(160deg,
    hsl(var(--glass-hue, 211) 100% 62% / calc(var(--glass-tint, 0) * 1.4)) 0%,
    hsl(var(--glass-hue, 211) 100% 52% / calc(var(--glass-tint, 0) * .5)) 55%,
    hsl(var(--glass-hue, 211) 100% 45% / calc(var(--glass-tint, 0) * .9)) 100%);
}

/* Rim. Temani Afif's mask-composite border technique: padding IS the border
   width, and the xor/exclude composite punches out the middle so only the
   1px frame paints. Brightest top-left, second highlight bottom-right. */
.glass::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  pointer-events: none;
  background: linear-gradient(145deg,
    rgba(255,255,255,.70) 0%,
    rgba(255,255,255,.12) 38%,
    rgba(255,255,255,.04) 62%,
    rgba(255,255,255,.42) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
}

/* Chromium only: the actual lens. Blur before AND after the displacement —
   pre-blur softens the source, post-blur hides feDisplacementMap's lack of
   supersampling. Filter id must exist in the document (see glass-filters.svg
   partial in templates/). */
@supports (backdrop-filter: url(#lens)) {
  .glass-lens {
    -webkit-backdrop-filter: blur(1px) url(#lens) blur(2px) saturate(1.8) brightness(1.12);
            backdrop-filter: blur(1px) url(#lens) blur(2px) saturate(1.8) brightness(1.12);
  }
}

/* Specular sheen. A child element, not a pseudo — both pseudos are taken.
   Position it with --sheen (0..1) from the timeline; do NOT use a CSS
   animation, that would break deterministic seeking. */
.sheen {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--sheen-opacity, .5);
  background: linear-gradient(
    105deg,
    transparent calc(var(--sheen, 0) * 140% - 30%),
    var(--glass-spec) calc(var(--sheen, 0) * 140% - 8%),
    transparent calc(var(--sheen, 0) * 140% + 14%));
  mix-blend-mode: plus-lighter;   /* additive; also stops opacity cross-fades
                                     from visibly blinking */
}

/* Grain. Kills gradient banding, which is the most common tell that a dark
   gradient was made in a browser rather than graded. Keep it 2-5%. */
.grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  opacity: var(--grain);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E");
}

/* Accessibility parity with Apple's Reduce Transparency. */
@media (prefers-reduced-transparency: reduce) {
  .glass, .glass-solid {
    -webkit-backdrop-filter: none;
            backdrop-filter: none;
    background: var(--bg-elev-2);
  }
  .sheen { display: none; }
}

/* 4. STAGE
   Fixed-size canvas, centred in the window and scaled down to fit. The stage
   is always dead centre with equal letterboxing on all four sides — a film
   pinned to one edge reads as a broken web page, not as a film.

   --stage-w/-h default to 16:9 here and are overwritten by timeline.js from
   the Timeline dimensions, so the JS is the single source of truth. Setting
   data-aspect on <html> picks a canvas without touching JS; see 4b.
   --stage-scale is computed by fit() and forced to 1 during render so
   screenshots come out at native resolution. */
html, body {
  margin: 0;
  padding: 0;
  background: #08080A;
  overflow: hidden;
  font-family: var(--font-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* Centring is done with a transform, NOT with grid/flex centring, and that is
   deliberate — see the note below, it is the single easiest thing to break here.

   `transform: scale()` shrinks what is PAINTED but never what is LAID OUT: the
   stage's layout box stays 1920x1080 no matter how far it is scaled down. So in
   any window narrower than 1920 CSS px the box is oversized, and every
   layout-based centring method fails on an oversized box:

     - grid/flex `place-items: center` — an `auto` track is never shrunk below
       its max-content base size, so the track stays 1920 wide, the item fills
       it exactly, and "centre" becomes a no-op. The stage sits at x=0, its
       centre lands at 960 while the window centre is at ~756, and the film is
       painted ~200px right of centre and clipped off the right edge.
     - `margin: auto` on an absolutely positioned box — CSS 2.1 §10.3.7 says
       that when equal margins would come out negative, ltr sets margin-left to
       0 and solves for margin-right. Same off-centre result.

   The symptom of getting this wrong is that the film only looks right if you
   zoom the browser out to ~50% — at 50% the CSS viewport is wide enough that
   the track finally has positive free space and stretches, so centring starts
   working again. If someone reports that, this rule is what regressed.

   top/left 50% puts the box's top-left corner at the centre; translate(-50%,
   -50%) pulls it back by half its own size, so its centre sits at the window
   centre whatever its size. Percentages in translate resolve against the
   element's own border box, which is why this is immune to the overflow.

   The `--chrome-h` offset lifts the centre by half the scrub bar's height so
   the film is centred in the space ABOVE the bar rather than behind it. It is
   0px unless mount() actually builds the controls. */
.viewport { position: fixed; inset: 0; overflow: hidden; }

.stage {
  position: absolute;
  top: calc(50% - var(--chrome-h, 0px) / 2);
  left: 50%;
  width: var(--stage-w, 1920px);
  height: var(--stage-h, 1080px);
  overflow: hidden;
  background: var(--bg-base);
  /* Order matters: translate first, then scale — CSS applies the RIGHTMOST
     function first, so the box is scaled about its own centre and then moved
     into place. Reversing these scales the centring offset too and the film
     drifts as it shrinks. */
  transform: translate(-50%, -50%) scale(var(--stage-scale, 1));
  transform-origin: center center;
  /* The film draws its OWN pointer, so the viewer's real one would be a second arrow
     in frame — but hiding it outright means the pointer vanishes the moment it crosses
     the preview and the viewer cannot find the scrub bar again. It is hidden only once
     the film is playing AND the mouse has been still for a beat; mount() owns
     `.cursor-idle` and clears it on any movement, click or keypress. The bar sits
     outside .stage and always keeps a normal pointer. */
  cursor: default;
}

body.cursor-idle .stage { cursor: none; }

/* 4b. ASPECT RATIOS
   Set on <html>: <html data-aspect="9:16">. The canvas changes and the type
   scale comes down with it, because 104px hero type that reads at 1920 wide is
   absurd on a 1080-wide vertical frame.

   Positions inside scenes are hand-placed pixels, so switching aspect on an
   existing film needs the layout revisited — this changes the canvas, not the
   composition. Pick the aspect before writing scenes.

   Must match the Timeline dimensions. Mismatch means the preview letterboxes
   differently from the export; mount() warns in the console if they disagree. */

/* 1:1 — square, for feed posts. */
[data-aspect="1:1"] {
  --stage-w: 1080px;
  --stage-h: 1080px;
  --fs-hero:     76px;
  --fs-display:  54px;
  --fs-title:    38px;
  --fs-headline: 28px;
  --fs-body:     21px;
  --fs-caption:  17px;
}

/* 9:16 — vertical, for stories and shorts. The narrowest canvas, so it is the
   one where oversized type breaks the layout first. */
[data-aspect="9:16"] {
  --stage-w: 1080px;
  --stage-h: 1920px;
  --fs-hero:     72px;
  --fs-display:  52px;
  --fs-title:    36px;
  --fs-headline: 27px;
  --fs-body:     21px;
  --fs-caption:  17px;
}

/* 4:5 — portrait feed. Taller than square, less extreme than 9:16. */
[data-aspect="4:5"] {
  --stage-w: 1080px;
  --stage-h: 1350px;
  --fs-hero:     76px;
  --fs-display:  54px;
  --fs-title:    38px;
  --fs-headline: 28px;
  --fs-body:     21px;
  --fs-caption:  17px;
}

/* 16:9 stated explicitly so the default is greppable rather than implied. */
[data-aspect="16:9"] { --stage-w: 1920px; --stage-h: 1080px; }

/* The camera. Animate this for push-ins, pans, and parallax — never animate
   the stage itself, and never animate scene children for a camera move. */
.camera {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  will-change: transform;
}

/* Scenes stack. The engine toggles visibility by time range, so overlapping
   cross-dissolves work. Off-range scenes get display:none to keep paint cheap
   and to stop offscreen glass from costing blur time every frame. */
.scene { position: absolute; inset: 0; opacity: 0; }

/* Render mode: strip anything non-deterministic and any preview chrome.

   The renderer loads the page with `?render=1`, which is what puts this class on
   <body>, so nothing here fires during normal preview. It also removes any chrome
   it finds structurally — anything outside the stage — so a composition that
   builds its own control bar without the .preview-ui class still exports clean.
   Mark custom preview furniture .preview-ui anyway; it is one word and it makes
   the intent readable. */
.render-mode .preview-ui { display: none !important; }
.render-mode * { transition: none !important; animation-play-state: paused !important; }
/* No OS pointer exists in a headless capture, but be explicit rather than rely on it. */
.render-mode .stage { cursor: none; }

/* 5. TYPOGRAPHY UTILITIES
   Tracking is baked per size on purpose. Tight tracking on large type is the
   loudest Apple typographic signal after the typeface itself. */
.t-hero {
  font-family: var(--font-display);
  font-size: var(--fs-hero);
  font-weight: 600;
  letter-spacing: var(--track-hero);
  line-height: 1.03;
  color: var(--label-1);
}
.t-display {
  font-family: var(--font-display);
  font-size: var(--fs-display);
  font-weight: 600;
  letter-spacing: var(--track-display);
  line-height: 1.06;
  color: var(--label-1);
}
.t-title {
  font-family: var(--font-display);
  font-size: var(--fs-title);
  font-weight: 600;
  letter-spacing: var(--track-title);
  line-height: 1.12;
  color: var(--label-1);
}
.t-headline {
  font-family: var(--font-display);
  font-size: var(--fs-headline);
  font-weight: 500;
  letter-spacing: var(--track-title);
  line-height: 1.2;
  color: var(--label-1);
}
.t-body {
  font-family: var(--font-text);
  font-size: var(--fs-body);
  font-weight: 400;
  letter-spacing: var(--track-body);
  line-height: 1.45;
  color: var(--label-2);
}
.t-caption {
  font-family: var(--font-text);
  font-size: var(--fs-caption);
  font-weight: 400;
  letter-spacing: var(--track-body);
  line-height: 1.4;
  color: var(--label-2);
}
.t-eyebrow {
  font-family: var(--font-text);
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: var(--track-eyebrow);
  text-transform: uppercase;
  color: var(--accent);
}
.t-mono {
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  letter-spacing: 0;
  font-variant-ligatures: none;
}
.t-grad {
  background: linear-gradient(100deg, #fff 0%, #fff 42%, var(--accent-4) 72%, var(--accent-3) 100%);
  -webkit-background-clip: text;
          background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.tnum { font-variant-numeric: tabular-nums; }  /* stops counters jittering */

/* Line-mask reveal. Wrap each line; the inner span slides up out of the mask.
   This is the single most useful text entrance in the whole toolkit. */
.line-mask { overflow: hidden; display: block; }
.line-mask > span { display: block; will-change: transform; }

/* 6. LAYOUT HELPERS */
.abs      { position: absolute; }
.center   { left: 50%; top: 50%; transform: translate(-50%, -50%); }
.center-x { left: 50%; transform: translateX(-50%); }
.stack    { display: flex; flex-direction: column; }
.row      { display: flex; align-items: center; }
.fill     { position: absolute; inset: 0; }

/* Backgrounds: aurora mesh + vignette. Apple leans on a dark field with one
   or two soft colored blooms, never a busy gradient. */
.bg-aurora {
  position: absolute;
  inset: -10%;
  background:
    radial-gradient(38% 44% at 22% 26%, hsl(211 100% 50% / .30), transparent 70%),
    radial-gradient(32% 40% at 78% 30%, hsl(266 85% 62% / .24), transparent 70%),
    radial-gradient(46% 50% at 60% 84%, hsl(190 95% 55% / .16), transparent 72%);
  filter: blur(20px);
}
.bg-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(72% 62% at 50% 46%, transparent 40%, rgba(0,0,0,.62) 100%);
}
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(255,255,255,.045) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,.045) 1px, transparent 1px);
  background-size: 64px 64px;
  -webkit-mask-image: radial-gradient(68% 60% at 50% 44%, #000 30%, transparent 100%);
          mask-image: radial-gradient(68% 60% at 50% 44%, #000 30%, transparent 100%);
}

/* 7. PREVIEW CHROME  (never rendered into the video) */
.preview-ui { position: fixed; z-index: 9999; font-family: var(--font-text); }
.scrub-bar {
  left: 0; right: 0; bottom: 0;
  padding: 14px 20px 16px;
  background: linear-gradient(to top, rgba(0,0,0,.88), rgba(0,0,0,0));
  display: flex;
  align-items: center;
  gap: 14px;
  opacity: 0;
  transition: opacity 180ms ease-out;
}
.viewport:hover ~ .scrub-bar, .scrub-bar:hover { opacity: 1; }
.scrub-bar input[type="range"] { flex: 1; accent-color: var(--accent); height: 4px; }
.scrub-bar button {
  background: rgba(255,255,255,.12);
  color: #fff;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: var(--r-sm);
  padding: 7px 13px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.scrub-bar .tc {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--label-2);
  min-width: 116px;
  font-variant-numeric: tabular-nums;
}
.scrub-bar .scene-name {
  font-size: 12px;
  color: var(--label-3);
  min-width: 130px;
  text-align: right;
}

/* Caption-safe area. Platform UI eats the bottom ~12% on social. */
.safe-guide {
  position: absolute;
  inset: 5% 5%;
  border: 1px dashed rgba(255,255,255,.18);
  pointer-events: none;
}
.safe-guide::after {
  content: "";
  position: absolute;
  left: -1px; right: -1px; bottom: -1px;
  height: 12%;
  border-top: 1px dashed rgba(255,120,120,.32);
}

@media (prefers-reduced-motion: reduce) {
  .camera { transform: none !important; }
}
```

### `assets/components.css`

```css
/* components.css — fake product UI that reads as real software.

   SCALE NOTE — read this before changing any size below.
   Real app UI at native size is unreadable in a 1080p video, especially once
   it's re-encoded by a social platform. Everything here is drawn at roughly
   1.35x native: body 17px, labels 13px, row height 52px. That is the sweet
   spot where UI still reads as "an actual app" but survives compression and
   a phone-sized viewport. Do not drop below ~13px for any text that matters.

   Also: never render a full app at 100% fidelity. Real explainers show a
   CROP of an interface — 3-6 rows, not 40. Detail you can't read is noise
   that costs legibility everywhere else. */

/* BROWSER FRAME
   The traffic-light chrome instantly signals "this is software" without a
   word of narration. Keep the URL short and real-looking. */
.browser {
  position: relative;
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--bg-elev-1);
  box-shadow: var(--sh-4);
  border: 1px solid rgba(255,255,255,.09);
}
.browser-bar {
  height: 46px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: rgba(255,255,255,.045);
  border-bottom: 1px solid rgba(255,255,255,.07);
}
.dot { width: 12px; height: 12px; border-radius: 50%; }
.dot-r { background: #FF5F57; }
.dot-y { background: #FEBC2E; }
.dot-g { background: #28C840; }
.browser-url {
  flex: 1;
  margin-left: 12px;
  height: 28px;
  border-radius: var(--r-xs);
  background: rgba(0,0,0,.32);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 13px;
  color: var(--label-3);
  font-family: var(--font-text);
}

/* APP SHELL — sidebar + topbar + content */
.app { display: flex; height: 100%; background: var(--bg-base); }

.sidebar {
  width: 232px;
  flex: none;
  padding: 18px 12px;
  background: rgba(255,255,255,.028);
  border-right: 1px solid rgba(255,255,255,.06);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 18px;
  font-size: 16px;
  font-weight: 600;
  color: var(--label-1);
  letter-spacing: -0.015em;
}
.side-mark {
  width: 26px; height: 26px;
  border-radius: 7px;
  background: linear-gradient(140deg, var(--accent), var(--accent-2));
  flex: none;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 11px;
  border-radius: var(--r-sm);
  font-size: 14.5px;
  color: var(--label-2);
  position: relative;
}
.nav-item .ico {
  width: 17px; height: 17px;
  border-radius: 5px;
  background: currentColor;
  opacity: .5;
  flex: none;
}
.nav-item.is-active { color: var(--label-1); background: rgba(255,255,255,.085); }
.nav-item.is-active .ico { opacity: .95; color: var(--accent); }

.topbar {
  height: 62px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255,255,255,.06);
}
.topbar h3 {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.018em;
  color: var(--label-1);
}
.content { flex: 1; padding: 24px; overflow: hidden; }

/* CARDS, METRICS, BADGES */
.card {
  background: rgba(255,255,255,.045);
  border: 1px solid rgba(255,255,255,.075);
  border-radius: var(--r-md);
  padding: 18px;
  box-shadow: var(--sh-1);
}
.metric { display: flex; flex-direction: column; gap: 7px; }
.metric .k {
  font-size: 13px;
  color: var(--label-3);
  letter-spacing: .02em;
  text-transform: uppercase;
  font-weight: 600;
}
.metric .v {
  font-size: 38px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--label-1);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.metric .d { font-size: 13.5px; font-weight: 500; }
.d-up { color: var(--ok); }
.d-down { color: var(--bad); }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 11px;
  border-radius: var(--r-pill);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: .01em;
  background: rgba(255,255,255,.1);
  color: var(--label-2);
}
.badge-ok   { background: rgba(48,209,88,.16);  color: #4ADE80; }
.badge-warn { background: rgba(255,214,10,.16); color: #FDE047; }
.badge-bad  { background: rgba(255,69,58,.16);  color: #FF6B6B; }
.badge-info { background: rgba(10,132,255,.18); color: #66B2FF; }
.badge .dot-s { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* BUTTONS + CONTROLS */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 18px;
  border-radius: var(--r-sm);
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.005em;
  background: rgba(255,255,255,.1);
  color: var(--label-1);
  border: 1px solid rgba(255,255,255,.1);
  white-space: nowrap;
}
.btn-primary {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 2px 12px rgba(10,132,255,.35);
}
.btn-lg { height: 52px; padding: 0 26px; font-size: 17px; border-radius: var(--r-md); }

.field {
  height: 40px;
  border-radius: var(--r-sm);
  background: rgba(0,0,0,.28);
  border: 1px solid rgba(255,255,255,.1);
  display: flex;
  align-items: center;
  padding: 0 13px;
  font-size: 14.5px;
  color: var(--label-2);
}
.switch {
  width: 46px; height: 27px;
  border-radius: var(--r-pill);
  background: rgba(255,255,255,.16);
  padding: 3px;
  display: flex;
}
.switch .knob {
  width: 21px; height: 21px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.4);
}
.switch.is-on { background: var(--ok); }
.switch.is-on .knob { transform: translateX(19px); }

.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: linear-gradient(140deg, #7C8DF5, #C86DD7);
  border: 2px solid var(--bg-elev-1);
  flex: none;
}
.avatar-stack { display: flex; }
.avatar-stack .avatar + .avatar { margin-left: -10px; }

/* LISTS + TABLES
   Row height 52px. Below ~44px rows stop reading as distinct at video scale. */
.rows { display: flex; flex-direction: column; }
.row-item {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  border-radius: var(--r-sm);
  border-bottom: 1px solid rgba(255,255,255,.045);
  font-size: 14.5px;
  color: var(--label-2);
}
.row-item .name { color: var(--label-1); font-weight: 500; flex: 1; }
.row-item.is-hot { background: rgba(10,132,255,.10); }
.th {
  display: flex;
  gap: 14px;
  padding: 0 14px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--label-3);
}

/* Kanban */
.board { display: flex; gap: 14px; }
.col { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.col-head {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--label-3);
  padding: 0 2px 4px;
}
.kcard {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: var(--r-sm);
  padding: 12px;
  font-size: 14px;
  color: var(--label-1);
  box-shadow: var(--sh-1);
}
.kcard .meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

/* CHARTS
   SVG so strokes can be drawn on with stroke-dashoffset and bars can be
   scaled from the baseline with transform-origin. */
.chart { width: 100%; height: 100%; display: block; overflow: visible; }
.bar {
  transform-origin: 50% 100%;   /* grow from the baseline, never the center */
  transform-box: fill-box;
}
.chart-line { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.chart-area { opacity: .18; }
.grid-line { stroke: rgba(255,255,255,.07); stroke-width: 1; }
.axis-label { font-size: 12px; fill: rgba(255,255,255,.34); font-family: var(--font-text); }
.donut-track { fill: none; stroke: rgba(255,255,255,.08); }
.donut-fill {
  fill: none;
  stroke-linecap: round;
  transform: rotate(-90deg);      /* start at 12 o'clock, like every real UI */
  transform-origin: 50% 50%;
  transform-box: fill-box;
}

/* CODE + TERMINAL */
.code {
  font-family: var(--font-mono);
  font-size: 15px;
  line-height: 1.65;
  background: rgba(0,0,0,.42);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: var(--r-md);
  padding: 18px 20px;
  color: #D6DEEB;
  white-space: pre;
  tab-size: 2;
}
.tok-key { color: #C792EA; }
.tok-str { color: #C3E88D; }
.tok-fn  { color: #82AAFF; }
.tok-num { color: #F78C6C; }
.tok-com { color: #5C6B80; font-style: italic; }
.tok-pun { color: #89A4BB; }
.caret { color: var(--accent); font-weight: 300; }

/* OVERLAYS: toast, modal, tooltip, cursor */
.toast {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 18px;
  border-radius: var(--r-md);
  min-width: 300px;
  box-shadow: var(--sh-3);
  font-size: 14.5px;
  color: var(--label-1);
}
.toast .ico-ok {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--ok);
  flex: none;
  display: grid;
  place-items: center;
}
.tooltip {
  padding: 9px 13px;
  border-radius: var(--r-xs);
  background: rgba(28,28,30,.96);
  border: 1px solid rgba(255,255,255,.12);
  font-size: 13px;
  color: var(--label-1);
  box-shadow: var(--sh-2);
  white-space: nowrap;
}

/* CURSOR — the pointer drawn INSIDE the film, not the viewer's OS pointer.

   This is a prop, like the browser chrome or the fake sidebar: it exists in the
   film's own coordinate space, moves on the timeline, and renders into the
   export. The viewer's real pointer is hidden over the stage (`cursor: none`)
   so there is never a second arrow in frame.

   ALWAYS AN ARROW. A dot, disc, or ring is ambiguous about what it is pointing
   at — the whole job of this element is to say "this control, right here", and
   only a tip does that. What changes between films is the STYLING, never the
   shape: five variants below, all the same silhouette.

   GEOMETRY IS THE CONTRACT. The path is authored so its tip sits on (0,0), the
   element's own top-left corner. So the hotspot needs no margin correction at
   all — `transform-origin: 0 0` and the tip is already on whatever x/y the
   engine writes. The click ring, being round, still centres itself with a
   negative margin; both then agree on the same point. Get this wrong and the
   ring blooms a few px off the tip, which reads as sloppy without ever looking
   like an actual bug.

   transform-origin on the tip also means the press scales the arrow ABOUT the
   tip, so it stays planted on the target instead of sliding off as it shrinks. */
.cursor {
  position: absolute;
  /* --cursor-size is the arrow's HEIGHT; the width follows the path's aspect
     (13.4 / 18.9) so the silhouette can never be squashed by a size change. */
  height: var(--cursor-size);
  width: calc(var(--cursor-size) * 0.709);
  /* The tip sits exactly on the box corner, so a stroke would be clipped by the
     viewBox. Nothing here scrolls, so visible overflow costs nothing. */
  overflow: visible;
  transform-origin: 0 0;
  pointer-events: none;
  z-index: 60;
  fill: var(--cursor-fill-solid);
  stroke: var(--cursor-edge);
  stroke-width: 1;
  stroke-linejoin: round;
  /* A drop-shadow, never backdrop-filter: a dissolving scene is a backdrop root,
     so a blurred cursor would silently go flat mid-fade. The shadow is what
     keeps the arrow legible over a light card and a dark hero alike. */
  filter: drop-shadow(0 2px 5px rgba(0,0,0,.5));
}

/* The five styles. Same arrow, different read — pick one per film and stay with
   it; a cursor that changes costume mid-film reads as an accident. */

/* GLASS — translucent body, bright rim. The default pairing for Liquid Glass
   scenes on a dark preset. */
.cursor--glass {
  fill: var(--cursor-fill);
  stroke: var(--cursor-spec);
  stroke-width: 1.2;
  filter: drop-shadow(0 2px 7px rgba(0,0,0,.55));
}

/* ACCENT — filled with the brand colour. Loudest of the five; good when the
   cursor is the subject of the shot rather than a passenger. */
.cursor--accent {
  fill: var(--cursor-core);
  stroke: var(--cursor-fill-solid);
  stroke-width: 1.1;
}

/* OUTLINE — hollow, drawn in the accent. Quietest; use when the UI underneath
   must stay fully readable through the pointer. */
.cursor--outline {
  fill: var(--cursor-fill-quiet);
  stroke: var(--cursor-core);
  stroke-width: 1.5;
}

/* SOFT — rounded silhouette, no visible rim. `paint-order: stroke` lays a fat
   round-joined stroke UNDER the fill, which is what rounds the corners off; the
   stroke colour therefore has to match the fill. Reads friendlier, consumer. */
.cursor--soft {
  stroke: var(--cursor-fill-solid);
  stroke-width: 3;
  paint-order: stroke;
  filter: drop-shadow(0 3px 8px rgba(0,0,0,.5));
}

/* Click ripple. Same hotspot contract as the cursor, so both take the same x/y. */
.click-ring {
  position: absolute;
  width: 46px; height: 46px;
  margin: -23px 0 0 -23px;
  border-radius: 50%;
  border: 2.5px solid var(--accent);
  box-shadow: 0 0 18px var(--cursor-halo);
  pointer-events: none;
  z-index: 59;
  opacity: 0;
}

/* Progress */
.bar-track {
  height: 7px;
  border-radius: var(--r-pill);
  background: rgba(255,255,255,.12);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--accent-4));
  transform-origin: 0 50%;
}

/* Skeleton shimmer. --shimmer is driven by the timeline, NOT a CSS animation,
   so it stays frame-accurate on export. */
.skeleton {
  border-radius: var(--r-xs);
  background:
    linear-gradient(90deg,
      rgba(255,255,255,.05) 0%,
      rgba(255,255,255,.05) calc(var(--shimmer, 0) * 130% - 22%),
      rgba(255,255,255,.14) calc(var(--shimmer, 0) * 130% - 4%),
      rgba(255,255,255,.05) calc(var(--shimmer, 0) * 130% + 16%),
      rgba(255,255,255,.05) 100%);
}

/* DEVICE FRAMES */
.phone {
  position: relative;
  border-radius: 46px;
  background: #0B0B0D;
  padding: 11px;
  box-shadow: var(--sh-4), inset 0 0 0 1.5px rgba(255,255,255,.14);
}
.phone-screen {
  border-radius: 36px;
  overflow: hidden;
  background: var(--bg-base);
  position: relative;
}
.phone-notch {
  position: absolute;
  top: 11px; left: 50%;
  transform: translateX(-50%);
  width: 108px; height: 28px;
  border-radius: var(--r-pill);
  background: #0B0B0D;
  z-index: 5;
}

/* END CARD */
.logo-lockup { display: flex; align-items: center; gap: 16px; }
.logo-mark {
  width: 58px; height: 58px;
  border-radius: 16px;
  background: linear-gradient(140deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 30px rgba(10,132,255,.4);
}
.logo-word {
  font-family: var(--font-display);
  font-size: 46px;
  font-weight: 600;
  letter-spacing: -0.035em;
  color: var(--label-1);
}
```

### `assets/timeline.js`

```js
/* timeline.js — deterministic, seekable animation engine (classic script, no
   modules, so it works over file:// with no server and no CORS problems).

   THE CONTRACT THAT MAKES VIDEO EXPORT WORK
   Animation state is a PURE FUNCTION of time t. Nothing depends on the
   browser's animation clock, on transition events, or on how many frames have
   elapsed. seek(1234) always produces byte-identical pixels.

   That means: do NOT put CSS `transition` on anything this engine animates.
   The engine writes inline styles directly; a transition would fight it and
   introduce time-dependence you cannot seek.

   Preview mode advances t with requestAnimationFrame. Render mode lets an
   external harness call seek(t) once per frame and screenshot. Same code path.

   Exposes: window.Timeline, window.Ease, window.splitText,
            window.__EXPLAINER__ (the render harness hook) */
(function (global) {
  'use strict';

  /* EASING
     Cubic-bezier solved with Newton-Raphson, falling back to bisection. Same
     algorithm class browsers use, so previews match CSS-eased elements. */
  function cubicBezier(x1, y1, x2, y2) {
    if (x1 === y1 && x2 === y2) return function (t) { return t; };
    var A = function (a1, a2) { return 1 - 3 * a2 + 3 * a1; };
    var B = function (a1, a2) { return 3 * a2 - 6 * a1; };
    var C = function (a1) { return 3 * a1; };
    var calc = function (t, a1, a2) { return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t; };
    var slope = function (t, a1, a2) { return 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1); };

    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var xEst = calc(t, x1, x2) - x;
        if (Math.abs(xEst) < 1e-6) return calc(t, y1, y2);
        var d = slope(t, x1, x2);
        if (Math.abs(d) < 1e-6) break;
        t -= xEst / d;
      }
      var lo = 0, hi = 1;
      t = x;
      for (var j = 0; j < 24; j++) {
        var v = calc(t, x1, x2);
        if (Math.abs(v - x) < 1e-6) break;
        if (v > x) hi = t; else lo = t;
        t = (lo + hi) / 2;
      }
      return calc(t, y1, y2);
    };
  }

  /* Closed-form damped spring. Deterministic and seekable — no per-frame
     integration, so seek(t) is exact at any t and never drifts. */
  function spring(opts) {
    opts = opts || {};
    var stiffness = opts.stiffness || 180;
    var damping = opts.damping || 22;
    var mass = opts.mass || 1;
    var w0 = Math.sqrt(stiffness / mass);
    var zeta = damping / (2 * Math.sqrt(stiffness * mass));
    /* Normalize the sim window so the spring has essentially settled at t=1,
       whatever the stiffness. 4.6 time-constants ~= 99% settled. */
    var settle = zeta < 1 ? 4.6 / (zeta * w0) : 6.0 / w0;
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var T = t * settle;
      if (zeta < 1) {
        var wd = w0 * Math.sqrt(1 - zeta * zeta);
        return 1 - Math.exp(-zeta * w0 * T) *
          (Math.cos(wd * T) + (zeta * w0 / wd) * Math.sin(wd * T));
      }
      return 1 - Math.exp(-w0 * T) * (1 + w0 * T);
    };
  }

  var Ease = {
    linear:       function (t) { return t; },
    /* Film-clock set. These are the curves that carry the piece. */
    outExpo:      cubicBezier(0.16, 1, 0.30, 1),
    outQuint:     cubicBezier(0.22, 1, 0.36, 1),
    outQuart:     cubicBezier(0.25, 1, 0.50, 1),
    outCubic:     cubicBezier(0.33, 1, 0.68, 1),
    outCirc:      cubicBezier(0.00, 0.55, 0.45, 1),
    outBack:      cubicBezier(0.34, 1.56, 0.64, 1),
    inExpo:       cubicBezier(0.70, 0, 0.84, 0),
    inCubic:      cubicBezier(0.32, 0, 0.67, 0),
    inQuart:      cubicBezier(0.50, 0, 0.75, 0),
    inOutCubic:   cubicBezier(0.65, 0, 0.35, 1),
    inOutQuart:   cubicBezier(0.76, 0, 0.24, 1),
    inOutQuint:   cubicBezier(0.83, 0, 0.17, 1),
    inOutCirc:    cubicBezier(0.85, 0, 0.15, 1),
    softLand:     cubicBezier(0.05, 0.70, 0.10, 1),
    standard:     cubicBezier(0.20, 0, 0, 1),
    /* Interactive-UI clock. */
    uiOut:        cubicBezier(0.00, 0, 0.58, 1),
    uiInOut:      cubicBezier(0.42, 0, 0.58, 1),
    spring:       spring(),
    springSoft:   spring({ stiffness: 120, damping: 20 }),
    springSnappy: spring({ stiffness: 320, damping: 26 }),
    bezier:       cubicBezier,
    makeSpring:   spring,
    /* Step function for hard cuts and typewriters. */
    steps: function (n) {
      return function (t) { return Math.floor(t * n) / n; };
    }
  };

  function resolveEase(e) {
    if (typeof e === 'function') return e;
    if (typeof e === 'string') {
      if (Ease[e]) return Ease[e];
      var m = e.match(/cubic-bezier\(([^)]+)\)/);
      if (m) {
        var p = m[1].split(',').map(Number);
        return cubicBezier(p[0], p[1], p[2], p[3]);
      }
    }
    return Ease.outQuint;
  }

  /* HELPERS */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }

  function toArray(target) {
    if (!target) return [];
    if (typeof target === 'string') {
      return Array.prototype.slice.call(document.querySelectorAll(target));
    }
    if (target.nodeType === 1) return [target];
    if (typeof target.length === 'number') {
      var out = [];
      for (var i = 0; i < target.length; i++) {
        var t = target[i];
        if (typeof t === 'string') out = out.concat(toArray(t));
        else if (t && t.nodeType === 1) out.push(t);
      }
      return out;
    }
    return [];
  }

  /* Deterministic pseudo-random from an integer seed. Used for "random"
     stagger and jitter so that the same frame always looks the same. A real
     Math.random() here would make video export non-reproducible. */
  function hashRand(i, salt) {
    var x = Math.sin((i + 1) * 12.9898 + (salt || 0) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function hyphen(k) {
    return k.charAt(0) === '-' ? k : k.replace(/[A-Z]/g, function (m) {
      return '-' + m.toLowerCase();
    });
  }

  /* VALUE INTERPOLATION
     Handles plain numbers, numbers with units ("24px", "-1.5em", "40%"),
     and colors (#rgb, #rrggbb, rgb(), rgba()). */
  var NUM_UNIT = /^(-?[\d.]+)([a-z%]*)$/i;

  function parseColor(v) {
    if (typeof v !== 'string') return null;
    v = v.trim();
    var m;
    if (v.charAt(0) === '#') {
      var h = v.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
              parseInt(h.slice(4, 6), 16), 1];
    }
    m = v.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      var p = m[1].split(',').map(function (s) { return parseFloat(s); });
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    return null;
  }

  function interpolate(from, to, p) {
    if (typeof from === 'number' && typeof to === 'number') {
      return lerp(from, to, p);
    }
    var cf = parseColor(from), ct = parseColor(to);
    if (cf && ct) {
      return 'rgba(' + Math.round(lerp(cf[0], ct[0], p)) + ',' +
                       Math.round(lerp(cf[1], ct[1], p)) + ',' +
                       Math.round(lerp(cf[2], ct[2], p)) + ',' +
                       (Math.round(lerp(cf[3], ct[3], p) * 1000) / 1000) + ')';
    }
    var mf = String(from).match(NUM_UNIT), mt = String(to).match(NUM_UNIT);
    if (mf && mt) {
      var unit = mt[2] || mf[2] || '';
      return (lerp(parseFloat(mf[1]), parseFloat(mt[1]), p)) + unit;
    }
    /* Structural: same skeleton, different numbers. This is what makes shape
       morphing work at all — see the block below. */
    var st = interpolateStructural(from, to, p);
    if (st !== null) return st;
    /* Genuinely non-interpolable: switch at the midpoint. */
    return p < 0.5 ? from : to;
  }

  /* STRUCTURAL INTERPOLATION — the whole basis of shape morphing here.

     An enormous number of CSS and SVG values are "a fixed skeleton with numbers
     poured into it":
       polygon(50% 0%, 100% 50%, 0% 100%)
       M0 0 C4 2 8 6 12 12 Z
       0 8px 24px rgba(0,0,0,0.28)
     If two values share the SAME skeleton — identical non-numeric text, in the
     same order, holding the same COUNT of numbers — then interpolating them is
     just lerping the numbers pairwise and pouring them back in. One rule buys
     clip-path polygons, SVG path data, `points` lists, gradient stops and
     shadows with no per-property special case.

     If the skeletons differ there is no honest pairwise answer: a 4-point
     polygon against a 6-point one has no correspondence, and an `L` command
     against a `C` does not even have matching arity. We return null and the
     caller falls back to a midpoint switch. That is the normalization problem,
     and it is the AUTHOR's job to fix by matching the two shapes — which is
     exactly what "Shape morphing" in the prose is about. */
  var NUM_G = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

  /* Split a value into its literal parts and its numbers.

     `split` on a global regex keeps the text BETWEEN the matches, so there is
     no placeholder character to collide with real content — a sentinel would
     have to be a character that can never appear in a CSS value, and there is
     no such character worth betting on.

     Whitespace runs are then collapsed, because once the numbers are out,
     `polygon(0% 0%, 1px 2px)` and `polygon(0% 0%,1px 2px)` describe the same
     shape and must be allowed to morph into each other. */
  function numSkeleton(v) {
    var str = String(v);
    var parts = str.split(NUM_G);
    var nums = str.match(NUM_G);
    var skel = [];
    for (var i = 0; i < parts.length; i++) {
      /* Separator normalization. Between two numbers, whitespace and commas
         both mean only "next number" — `polygon(0% 0%,1px 2px)` and
         `polygon(0% 0%, 1px 2px)` are the same shape, and `M0 0` and `M0,0`
         are the same path. Collapsing them means an author's formatting can
         never be the reason a morph silently degrades to a midpoint snap.
         Everything that carries MEANING — the function name, the parens, the
         units, the path command letters — survives untouched, so two genuinely
         different values still fail to match. */
      skel.push(parts[i].replace(/[\s,]+/g, ' ').trim());
    }
    return {
      skel: skel.join('\u0000'),
      parts: parts,
      nums: nums ? nums.map(parseFloat) : []
    };
  }

  function interpolateStructural(from, to, p) {
    var a = numSkeleton(from), b = numSkeleton(to);
    /* Same literal skeleton AND the same count of numbers, or there is no
       honest pairwise correspondence to interpolate. */
    if (!a.nums.length || a.nums.length !== b.nums.length) return null;
    if (a.skel !== b.skel) return null;
    var out = b.parts[0];
    for (var i = 0; i < b.nums.length; i++) {
      var v = lerp(a.nums[i], b.nums[i], p);
      /* 3dp is below the visible threshold at any sane stage size, and keeps a
         200-point path from becoming a kilobyte of attribute churn per frame. */
      out += String(Math.round(v * 1000) / 1000) + b.parts[i + 1];
    }
    return out;
  }

  /* PROPERTY MODEL
     Transforms must be composed into ONE transform string per element per
     frame, otherwise the last tween to write wins and everything else is
     silently dropped. Same for filters. This is the single most common bug in
     hand-rolled animation code, so the engine owns it. */
  var TRANSFORM_ORDER = ['perspective', 'translate3d', 'rotate', 'rotateX',
    'rotateY', 'skewX', 'skewY', 'scaleXY'];

  var TRANSFORM_PROPS = {
    x: 1, y: 1, z: 1, scale: 1, scaleX: 1, scaleY: 1, rotate: 1,
    rotateX: 1, rotateY: 1, skewX: 1, skewY: 1, perspective: 1
  };
  var FILTER_PROPS = { blur: 'px', saturate: '', brightness: '', contrast: '', grayscale: '' };

  var TRANSFORM_DEFAULTS = {
    x: 0, y: 0, z: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
    rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, perspective: 0
  };

  function unitFor(prop, v) {
    if (typeof v !== 'number') return String(v);
    if (prop === 'x' || prop === 'y' || prop === 'z' || prop === 'perspective') return v + 'px';
    if (prop === 'rotate' || prop === 'rotateX' || prop === 'rotateY' ||
        prop === 'skewX' || prop === 'skewY') return v + 'deg';
    return String(v);
  }

  function buildTransform(t) {
    var out = [];
    if (t.perspective) out.push('perspective(' + unitFor('perspective', t.perspective) + ')');
    if (t.x !== undefined || t.y !== undefined || t.z !== undefined) {
      var x = t.x === undefined ? 0 : t.x;
      var y = t.y === undefined ? 0 : t.y;
      var z = t.z === undefined ? 0 : t.z;
      if (x || y || z) {
        out.push('translate3d(' + unitFor('x', x) + ',' + unitFor('y', y) + ',' + unitFor('z', z) + ')');
      }
    }
    ['rotate', 'rotateX', 'rotateY', 'skewX', 'skewY'].forEach(function (k) {
      if (t[k] !== undefined && parseFloat(t[k]) !== 0) {
        out.push(k + '(' + unitFor(k, t[k]) + ')');
      }
    });
    var sx = t.scaleX !== undefined ? t.scaleX : t.scale;
    var sy = t.scaleY !== undefined ? t.scaleY : t.scale;
    if (sx !== undefined || sy !== undefined) {
      sx = sx === undefined ? 1 : sx;
      sy = sy === undefined ? 1 : sy;
      if (sx !== 1 || sy !== 1) out.push('scale(' + sx + ',' + sy + ')');
    }
    return out.length ? out.join(' ') : '';
  }

  function buildFilter(f) {
    var out = [];
    for (var k in f) {
      if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
      var v = f[k];
      out.push(k + '(' + (typeof v === 'number' ? v + FILTER_PROPS[k] : v) + ')');
    }
    return out.length ? out.join(' ') : '';
  }

  /* TIMELINE */
  function Timeline(opts) {
    opts = opts || {};
    this.fps = opts.fps || 60;
    this.duration = opts.duration || 30000;
    this.width = opts.width || 1920;
    this.height = opts.height || 1080;
    this.records = [];
    this.scenes = [];
    this.cues = [];
    this.loops = [];
    this.t = -1;
    this._acc = new Map();
    this._touched = new Map();
  }

  /* Normalize a property spec.
       { opacity: [0, 1] }        explicit from -> to
       { opacity: 0 }             from the channel default -> 0
       { scale: [0.9, 1.06, 1] }  N keyframes, evenly spaced
     The single-value form is what makes exits read naturally: `{opacity: 0}`
     means "fade out from wherever the neutral state is", i.e. from 1.

     Three or more values become a keyframe track. `from`/`to` are still set to
     the first and last values so any code reading them keeps working; `ks` is
     what the sampler uses when present. */
  function normProp(key, spec) {
    if (Array.isArray(spec)) {
      if (spec.length > 2) return { from: spec[0], to: spec[spec.length - 1], ks: spec };
      return { from: spec[0], to: spec[1] };
    }
    /* An attribute channel has no meaningful neutral value — there is no
       "default d" to fade a path in from — so a single value HOLDS. Without
       this, `{ '@d': 'M0 0...' }` would try to interpolate from the numeric
       default 0 and snap at the midpoint instead. */
    if (String(key).charAt(0) === '@') return { from: spec, to: spec };
    var def;
    if (TRANSFORM_PROPS[key]) def = TRANSFORM_DEFAULTS[key];
    else if (key === 'opacity') def = 1;
    else if (key === 'blur') def = 0;
    else if (key in FILTER_PROPS) def = 1;
    else def = 0;
    return { from: def, to: spec };
  }

  /* Sample a keyframe track at eased progress e.

     Keyframes are positioned by `times` (normalized 0..1, defaults to even
     spacing) and each segment is interpolated independently. `easeEach` applies
     a curve within every segment, on top of the record's overall ease — the
     outer ease distributes time across the whole move, the inner one shapes each
     leg. Without an inner ease, segment joins are linear and a bounce reads
     mechanical at the turn.

     Still a pure function of e, so seeking anywhere stays exact. */
  function sampleKeys(ks, times, easeEach, e) {
    var n = ks.length, last = n - 1;
    if (e <= 0) return ks[0];
    if (e >= 1) return ks[last];

    /* Find the segment containing e. Linear scan: tracks are 3-6 keys in
       practice, so an index cache would cost more than it saves — and it would
       make sampling stateful, which breaks arbitrary seeking. */
    var i = 0;
    if (times) {
      while (i < last - 1 && e >= times[i + 1]) i++;
    } else {
      i = Math.min(last - 1, Math.floor(e * last));
    }

    var t0 = times ? times[i] : i / last;
    var t1 = times ? times[i + 1] : (i + 1) / last;
    var span = t1 - t0;
    /* Defensive only — span is not reachable at 0 today. A hard cut (two keys
       sharing an offset) is handled by the scan above, whose `>=` steps past
       the zero-width segment, and the validator guarantees times[0] === 0 and
       times[last] === 1 while e <= 0 / e >= 1 already returned. Kept because
       the alternative is a NaN written straight into a transform, which paints
       nothing and gives no clue why. */
    var local = span > 0 ? (e - t0) / span : 1;
    if (easeEach) local = easeEach(clamp01(local));
    return interpolate(ks[i], ks[i + 1], local);
  }

  /* Stagger ordering. 'random' is seeded, never Math.random(), because video
     export must be reproducible frame for frame. */
  function staggerIndex(mode, i, n) {
    switch (mode) {
      case 'end':    return n - 1 - i;
      case 'center': return Math.abs(i - (n - 1) / 2);
      case 'edges':  return (n - 1) / 2 - Math.abs(i - (n - 1) / 2);
      case 'random': return hashRand(i, 7) * n;
      default:       return i;
    }
  }

  /* tl.add(target, { at, dur, ease, stagger, staggerFrom, origin, ...props }) */
  Timeline.prototype.add = function (target, cfg) {
    cfg = cfg || {};
    var els = toArray(target);
    if (!els.length) {
      if (typeof target === 'string' && !this._warned) {
        console.warn('[timeline] no elements matched:', target);
      }
      return this;
    }
    var at = cfg.at || 0;
    var dur = cfg.dur === undefined ? 480 : cfg.dur;
    var ease = resolveEase(cfg.ease);
    var stagger = cfg.stagger || 0;
    var mode = cfg.staggerFrom || 'start';

    /* Keyframe timing, shared by every property in this record. */
    var easeEach = cfg.easeEach ? resolveEase(cfg.easeEach) : null;
    var times = null;
    if (cfg.times) {
      times = cfg.times.slice();
      /* Malformed times would produce a silently wrong curve, so validate loudly
         and fall back to even spacing rather than animating something subtly
         incorrect for the rest of the film. */
      var monotonic = times[0] === 0;
      for (var ti = 1; ti < times.length; ti++) {
        if (times[ti] < times[ti - 1]) { monotonic = false; break; }
      }
      if (!monotonic || times[times.length - 1] !== 1) {
        console.warn('[timeline] times must start at 0, end at 1, and never ' +
          'decrease — got [' + times.join(', ') + ']. Falling back to even spacing.');
        times = null;
      }
    }

    var props = {};
    for (var k in cfg) {
      if (!Object.prototype.hasOwnProperty.call(cfg, k)) continue;
      if (k === 'at' || k === 'dur' || k === 'ease' || k === 'stagger' ||
          k === 'staggerFrom' || k === 'origin' || k === 'label' ||
          k === 'times' || k === 'easeEach') continue;
      props[k] = normProp(k, cfg[k]);

      /* times must describe the track it is applied to. A mismatch means the
         author changed one and not the other. */
      if (times && props[k].ks && times.length !== props[k].ks.length) {
        console.warn('[timeline] ' + k + ' has ' + props[k].ks.length +
          ' keyframes but times has ' + times.length +
          ' entries. Using even spacing for ' + k + '.');
      }
    }

    for (var i = 0; i < els.length; i++) {
      if (cfg.origin) els[i].style.transformOrigin = cfg.origin;
      this.records.push({
        el: els[i],
        start: at + staggerIndex(mode, i, els.length) * stagger,
        dur: dur,
        ease: ease,
        props: props,
        times: times,
        easeEach: easeEach
      });
    }
    return this;
  };

  /* Instant set — a zero-duration record, so it still participates in the
     compose step and cannot be clobbered by transform writes elsewhere. */
  Timeline.prototype.set = function (target, props) {
    var cfg = { at: 0, dur: 0 };
    for (var k in props) {
      if (Object.prototype.hasOwnProperty.call(props, k)) {
        cfg[k] = [props[k], props[k]];
      }
    }
    return this.add(target, cfg);
  };

  /* Scene = a time range plus auto fade in/out. Returns a scoped helper so
     scene code can use times relative to the scene start, which keeps beat
     sheets readable and lets you move a whole scene by editing one number. */
  Timeline.prototype.scene = function (name, start, dur, opts) {
    opts = opts || {};
    var root = typeof opts.root === 'string'
      ? document.querySelector(opts.root)
      : (opts.root || document.querySelector('[data-scene="' + name + '"]'));
    var self = this;
    /* Default is a HARD CUT. A fade on every scene dissolves every cut, and a
       dissolve between two scenes that share no element just reads as mush.
       Pass `fade` only where you want a real dissolve (or an opening fade up
       from black); pass `overlay: true` for a layer that outlives the cuts,
       like a persistent HUD. */
    var fade = opts.fade === undefined ? 0 : opts.fade;

    this.scenes.push({ name: name, start: start, dur: dur, el: root, fade: fade,
                       overlay: !!opts.overlay });
    /* Scenes may be declared in any order and a scene's paint window depends on
       its neighbours, so the windows are resolved lazily and cached. */
    this._cuts = null;

    return {
      root: root,
      /* q = query within the scene, so selectors can't leak across scenes. */
      q: function (sel) {
        return root ? Array.prototype.slice.call(root.querySelectorAll(sel)) : [];
      },
      add: function (target, cfg) {
        cfg = Object.assign({}, cfg);
        cfg.at = start + (cfg.at || 0);
        if (typeof target === 'string' && root) target = root.querySelectorAll(target);
        self.add(target, cfg);
        return this;
      },
      set: function (target, props) {
        if (typeof target === 'string' && root) target = root.querySelectorAll(target);
        self.set(target, props);
        return this;
      },
      cue: function (name, at, opts2) {
        self.cue(name, start + at, opts2);
        return this;
      },
      start: start,
      dur: dur,
      end: start + dur
    };
  };

  /* Audio cue. Fired on playback; collected by the offline renderer to build
     the soundtrack. Cues are data, not side effects, so the same list drives
     both live preview and offline WAV rendering. */
  /* CURSOR + POINTING

     Hand-derived cursor coordinates are the single biggest source of "the
     cursor clicks next to the button" bugs. A comment like
     `frame (160,88) + browser bar 46 + sidebar 232 + topbar 62 + pad 22` is
     correct exactly once; the next layout tweak silently invalidates it and
     nothing errors, because a wrong number is still a number.

     So derive the point from the DOM instead. */

  /* The stage element an animated node belongs to. */
  function stageOf(el) {
    for (var n = el; n; n = n.parentNode) {
      if (n.classList && n.classList.contains('stage')) return n;
    }
    return document.querySelector('.stage');
  }

  /* An element's box in STAGE coordinates — the same 1920x1080 space every
     hand-written `left`/`top` in the markup uses.

     Deliberately walks offsetParent instead of using getBoundingClientRect:
     offsets are LAYOUT positions, so they ignore the stage's fit scale and any
     camera transform in between. getBoundingClientRect would fold both in and
     the result would change with the window size, which is exactly the class of
     bug this helper exists to remove.

     Caveat worth knowing: layout position is the element's UNANIMATED position.
     Point at something the timeline moves and you get where it started, not
     where it currently is. Point at stable geometry — a button, a row, a card. */
  function boxInStage(el) {
    var stage = stageOf(el);
    /* offsetParent is null for a display:none subtree, so un-hide ancestors for
       the measurement and put them back. Synchronous, so nothing is painted. */
    var undo = [], n;
    for (n = el; n && n !== stage; n = n.parentNode) {
      if (n.style && n.style.display === 'none') {
        undo.push(n); n.style.display = '';
      }
    }
    var x = 0, y = 0;
    for (n = el; n && n !== stage; n = n.offsetParent) {
      x += n.offsetLeft || 0;
      y += n.offsetTop || 0;
      /* A positioned ancestor's border sits outside its padding box, which is
         what offsetLeft is measured from. */
      var op = n.offsetParent;
      if (op && op !== stage) { x += op.clientLeft || 0; y += op.clientTop || 0; }
    }
    for (var i = 0; i < undo.length; i++) undo[i].style.display = 'none';
    var w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2 };
  }

  function firstOf(target) { var a = toArray(target); return a.length ? a[0] : null; }

  /* Stage-space point for a target. `align` picks the spot: 'center' (default),
     'left', 'right', 'top', 'bottom'. `dx`/`dy` nudge it.

     Use this for camera moves too — camTo(tl.point('[data-el="x"]')) beats
     re-deriving the same arithmetic by hand. */
  Timeline.prototype.point = function (target, opts) {
    opts = opts || {};
    var el = firstOf(target);
    if (!el) {
      if (!this._warnedPoint) {
        this._warnedPoint = true;
        console.warn('[timeline] point(): no element matched:', target);
      }
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    var b = boxInStage(el);
    var x = b.cx, y = b.cy, a = opts.align || 'center';
    if (a === 'left')   x = b.x;
    if (a === 'right')  x = b.x + b.w;
    if (a === 'top')    y = b.y;
    if (a === 'bottom') y = b.y + b.h;
    if (!b.w && !b.h && !this._warnedZero) {
      this._warnedZero = true;
      console.warn('[timeline] point(): target measured 0x0 — is it in the ' +
                   'stage, and does it have layout? ', target);
    }
    return { x: x + (opts.dx || 0), y: y + (opts.dy || 0), w: b.w, h: b.h };
  };

  /* The whole travel -> settle -> press -> release -> ring chain in one call,
     aimed at an ELEMENT rather than at coordinates.

     Returns the timing the caller needs, notably `respondAt` — the moment the
     UI should react. Deliberately not chainable: the numbers are the point.

       var c = tl.cursorTo('[data-el="save"]', { at: 2000 });
       tl.add('[data-el="toast"]', { at: c.respondAt, ... });   // 80-140ms later
  */
  Timeline.prototype.cursorTo = function (target, cfg) {
    cfg = cfg || {};
    var at = cfg.at || 0;
    var travel = cfg.travel === undefined ? 620 : cfg.travel;
    var settle = cfg.settle === undefined ? 120 : cfg.settle;
    var press = cfg.press === undefined ? 90 : cfg.press;
    var release = cfg.release === undefined ? 220 : cfg.release;
    var click = cfg.click !== false;
    var cur = firstOf(cfg.cursor || '[data-el="cursor"]');
    var ring = firstOf(cfg.ring || '[data-el="ring"]');
    var p = target && target.x !== undefined ? target : this.point(target, cfg);

    if (!cur) {
      if (!this._warnedCursor) {
        this._warnedCursor = true;
        console.warn('[timeline] cursorTo(): no [data-el="cursor"] element. Add ' +
                     'the cursor + ring markup as the last children of .camera.');
      }
      return { arriveAt: at + travel, pressAt: at + travel + settle,
               respondAt: at + travel + settle + press + 110, point: p };
    }

    /* Where this move starts. Precedence, and the order matters:
         1. an explicit cfg.from — art direction wins;
         2. wherever the last cursorTo() left it, so calls chain into a path;
         3. off to one side of the target. Never 0,0: a cursor that starts in the
            top-left corner announces that it is a div. */
    var from = cfg.from || this._cursorAt || {
      x: Math.max(60, p.x - 300),
      y: Math.min((this.height || 1080) - 60, p.y + 260)
    };

    if (!this._cursorShown) {
      this._cursorShown = true;
      this.set(cur, { opacity: 0 });
      this.set(cur, { x: from.x, y: from.y });
      this.add(cur, { at: at, dur: 260, ease: 'outCubic', opacity: [0, 1] });
      if (ring) this.set(ring, { opacity: 0, scale: 0.4 });
    }

    /* Bow the path. A straight line between two points is the tell that a
       machine moved the cursor; sampling a quadratic Bezier whose control point
       is pushed perpendicular to the path gives a hand-like arc, and sampling
       (rather than a 3-key polyline) keeps it smooth through the middle. */
    var dx = p.x - from.x, dy = p.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var bow = cfg.bow === undefined ? Math.min(90, dist * 0.16) : cfg.bow;
    var nx = -dy / dist, ny = dx / dist;
    var ctl = { x: (from.x + p.x) / 2 + nx * bow, y: (from.y + p.y) / 2 + ny * bow };
    var xs = [], ys = [], k, u, iu;
    for (k = 0; k <= 4; k++) {
      u = k / 4; iu = 1 - u;
      xs.push(iu * iu * from.x + 2 * iu * u * ctl.x + u * u * p.x);
      ys.push(iu * iu * from.y + 2 * iu * u * ctl.y + u * u * p.y);
    }
    this.add(cur, { at: at, dur: travel, ease: 'inOutCubic', x: xs, y: ys });

    var arriveAt = at + travel;
    var pressAt = arriveAt + settle;
    if (click) {
      /* Press then release on one element is exactly the chain the precedence
         rule exists for: the release record is inserted later, so once it
         starts it displaces the press. */
      this.add(cur, { at: pressAt, dur: press, ease: 'outCubic', scale: [1, 0.88] });
      this.add(cur, { at: pressAt + press, dur: release, ease: 'outBack', scale: [0.88, 1] });
      if (ring) {
        /* Park the ring on this click's point AT the press, not at t=0 — a
           zero-duration record at 0 for every click would leave every ring at
           the last click's coordinates. */
        this.add(ring, { at: pressAt, dur: 0, x: [p.x, p.x], y: [p.y, p.y] });
        this.add(ring, { at: pressAt, dur: 460, ease: 'outQuint',
                         scale: [0.4, 1.9], opacity: [0.55, 0] });
      }
    }
    this._cursorAt = { x: p.x, y: p.y };
    return {
      arriveAt: arriveAt,
      pressAt: pressAt,
      releaseAt: pressAt + press,
      /* Real software has latency. Instant response reads as fake. */
      respondAt: pressAt + press + (cfg.latency === undefined ? 110 : cfg.latency),
      endAt: pressAt + press + release,
      point: p
    };
  };

  Timeline.prototype.cue = function (name, at, opts) {
    this.cues.push(Object.assign({ name: name, at: at }, opts || {}));
    return this;
  };

  /* Continuous/looping motion (drifting gradients, spinners, shimmer).
     Expressed as a function of t so it stays seekable. Never use a CSS
     @keyframes animation for this — CSS animations run on the browser clock
     and would desync from the render harness. */
  Timeline.prototype.loop = function (fn) {
    this.loops.push(fn);
    return this;
  };

  /* SEEK — the whole contract in one function.

     Evaluates EVERY record at time t, in insertion order, accumulating into a
     per-element bucket, then flushes once.

     PRECEDENCE. Records use fill-both semantics: before a record starts it
     holds its `from`, after it ends it holds its `to`. That is what makes
     scrubbing backwards work and why you can seek to any t cold. But naive
     fill-both plus "last write wins" silently breaks every chained tween —
     given a press (scale 1 -> .88 at 2500) followed by a release
     (.88 -> 1 at 2590), the release's `from` would fill backwards and pin the
     element at .88 for the entire timeline before 2590.

     So the rule is three-tiered, per property:
       1. A record that has STARTED (t >= start) beats one that has not.
       2. Among started records, the LAST inserted wins  — so you can layer.
       3. Among not-yet-started records, the FIRST wins — so the earliest
          record supplies the initial pose and later ones stay out of the way.

     This is what makes `set()` then `add()` behave the way you'd expect, and
     what lets you chain any number of tweens on one property. */
  Timeline.prototype.seek = function (t) {
    t = Math.max(0, Math.min(this.duration, t));
    this.t = t;
    var acc = this._acc;
    acc.clear();

    var i, n, s;

    /* Scene visibility, from the derived paint window rather than the declared
       range — see _resolveScenes for why those differ. display:none outside the
       window also keeps offscreen glass from costing a backdrop-filter pass on
       every frame, which is often the difference between 4 fps and 30 fps in
       preview.

       Opacity is computed here instead of being written as records at declare
       time, because a scene's fade window is only knowable once its neighbours
       are known. Author records on the scene root still win: they are applied
       in the flush pass below, which runs after this one. */
    var cuts = this._resolveScenes();
    for (i = 0, n = cuts.length; i < n; i++) {
      s = cuts[i];
      if (!s.el) continue;
      var atEnd = t >= this.duration && s.visEnd >= this.duration;
      var live = t >= s.start && (t < s.visEnd || atEnd);
      s.el.style.display = live ? '' : 'none';
      s.el.style.setProperty('z-index', s.z);
      var op = 0;
      if (live) {
        op = 1;
        if (s.fade > 0 && t < s.start + s.fade) {
          op = Ease.outCubic(clamp01((t - s.start) / s.fade));
        } else if (s.outDur > 0 && t > s.visEnd - s.outDur) {
          op = 1 - Ease.inCubic(clamp01((t - (s.visEnd - s.outDur)) / s.outDur));
        }
      }
      s.el.style.setProperty('opacity', op);
    }

    for (i = 0, n = this.records.length; i < n; i++) {
      var r = this.records[i];
      var p;
      if (r.dur <= 0) p = t >= r.start ? 1 : 0;
      else p = clamp01((t - r.start) / r.dur);
      var e = r.ease(p);

      var bucket = acc.get(r.el);
      if (!bucket) {
        bucket = { tf: null, ft: null, st: null, vr: null, at: null, rank: {} };
        acc.set(r.el, bucket);
      }

      /* Rank encodes tier 1 of the precedence rule; ties are then broken by
         insertion order in the comparison below. */
      var started = t >= r.start;

      for (var k in r.props) {
        if (!Object.prototype.hasOwnProperty.call(r.props, k)) continue;

        /* Tier 2/3: a started record always displaces a pending one; between
           two started records the later wins; between two pending ones the
           earlier is kept. */
        var prev = bucket.rank[k];
        if (prev !== undefined) {
          if (prev === 1 && !started) continue;      /* pending never beats started */
          if (prev === 0 && !started) continue;      /* keep the FIRST pending      */
        }
        bucket.rank[k] = started ? 1 : 0;

        var spec = r.props[k];
        /* Multi-keyframe tracks sample per segment; the 2-value case stays on
           the single-interpolate fast path so existing films pay nothing. */
        var v;
        if (spec.ks) {
          var kt = (r.times && r.times.length === spec.ks.length) ? r.times : null;
          v = sampleKeys(spec.ks, kt, r.easeEach, e);
        } else {
          v = interpolate(spec.from, spec.to, e);
        }

        if (TRANSFORM_PROPS[k]) {
          (bucket.tf || (bucket.tf = {}))[k] = v;
        } else if (k in FILTER_PROPS) {
          (bucket.ft || (bucket.ft = {}))[k] = v;
        } else if (k.charAt(0) === '-' && k.charAt(1) === '-') {
          (bucket.vr || (bucket.vr = {}))[k] = v;
        } else if (k.charAt(0) === '@') {
          /* ATTRIBUTE channel. `@d`, `@points`, `@r`, `@stdDeviation`... Some
             SVG geometry is an ATTRIBUTE, not a style: `d` is only a CSS
             property in newer engines and not everywhere, while the attribute
             has worked since SVG 1.1. The `@` prefix says "write this with
             setAttribute", the same way `--` says "write it with
             setProperty". */
          (bucket.at || (bucket.at = {}))[k.slice(1)] = v;
        } else {
          (bucket.st || (bucket.st = {}))[k] = v;
        }
      }
    }

    /* Flush. One write pass per element per frame. */
    acc.forEach(function (b, el) {
      if (b.tf) {
        var base = el.getAttribute('data-base-transform');
        var tf = buildTransform(b.tf);
        el.style.transform = base ? (base + ' ' + tf) : (tf || 'none');
      }
      if (b.ft) el.style.filter = buildFilter(b.ft) || 'none';
      if (b.st) {
        for (var k in b.st) {
          if (Object.prototype.hasOwnProperty.call(b.st, k)) {
            el.style.setProperty(hyphen(k), b.st[k]);
          }
        }
      }
      if (b.vr) {
        for (var v in b.vr) {
          if (Object.prototype.hasOwnProperty.call(b.vr, v)) {
            el.style.setProperty(v, b.vr[v]);
          }
        }
      }
      if (b.at) {
        for (var a in b.at) {
          if (Object.prototype.hasOwnProperty.call(b.at, a)) {
            el.setAttribute(a, b.at[a]);
          }
        }
      }
    });

    for (i = 0; i < this.loops.length; i++) this.loops[i](t);
    return this;
  };

  /* Derive each scene's PAINT window from its neighbours.

     A scene's time range and its visible window are two different things. The
     range is allowed to overlap the next scene's — that is how a tween can
     still be resolving across a cut, which is what keeps a film from coming to
     a dead stop seven times. But only ONE scene may be painted at a time.
     Painting both is what leaves the outgoing scene's elements sitting on top
     of the incoming one for the length of the overlap: scenes are absolutely
     positioned siblings and a scene has no opaque background of its own, so the
     old content simply shows through the new one.

     So: a scene paints from its own start until the next non-overlay scene
     starts, NOT until its own range ends. */
  Timeline.prototype._resolveScenes = function () {
    if (this._cuts) return this._cuts;
    var list = this.scenes.slice().sort(function (a, b) { return a.start - b.start; });
    var flow = [], i;
    for (i = 0; i < list.length; i++) if (!list[i].overlay) flow.push(list[i]);

    for (i = 0; i < list.length; i++) {
      var s = list[i];
      /* Later scenes paint above earlier ones regardless of DOM order, so a
         dissolve layers correctly. Overlays sit above the whole stack. */
      s.z = (s.overlay ? 100 : 1) + i;
      s.outDur = 0;
      if (s.overlay) { s.visEnd = s.start + s.dur; continue; }

      var idx = flow.indexOf(s);
      var nxt = idx === -1 ? null : flow[idx + 1] || null;
      if (!nxt) {
        /* Last scene: its own fade is the film's fade out. */
        s.visEnd = s.start + s.dur;
        s.outDur = Math.min(s.fade, s.visEnd - s.start);
      } else if (nxt.fade > 0) {
        /* The incoming scene dissolves in, so this one has to stay painted
           underneath it and fade out across exactly the same window. */
        s.visEnd = Math.min(s.start + s.dur, nxt.start + nxt.fade);
        s.outDur = Math.min(nxt.fade, s.visEnd - s.start);
      } else {
        /* Hard cut: gone on the exact frame the next scene appears. */
        s.visEnd = Math.min(s.start + s.dur, nxt.start);
      }
    }
    this._cuts = list;
    return list;
  };

  Timeline.prototype.sceneAt = function (t) {
    var cuts = this._resolveScenes();
    for (var i = cuts.length - 1; i >= 0; i--) {
      var s = cuts[i];
      if (!s.overlay && t >= s.start && t < s.visEnd) return s.name;
    }
    return '';
  };

  /* TEXT + PATH HELPERS
     Implemented as loops (evaluated every seek) rather than as style records,
     because they write textContent / attributes rather than CSS. Still pure
     functions of t, so still frame-accurate. */

  /* Typewriter. Monospace or a fixed-width container is strongly advised —
     otherwise the line reflows every frame and the text visibly jitters. */
  Timeline.prototype.type = function (target, cfg) {
    var els = toArray(target);
    if (!els.length) return this;
    var at = cfg.at || 0;
    var dur = cfg.dur === undefined ? 1200 : cfg.dur;
    var ease = resolveEase(cfg.ease || 'linear');
    var caret = cfg.caret !== false;

    els.forEach(function (el) {
      var full = cfg.text !== undefined ? cfg.text : el.textContent;
      el.textContent = '';
      var span = document.createElement('span');
      var cur = document.createElement('span');
      cur.className = 'caret';
      cur.textContent = '▏';
      el.appendChild(span);
      if (caret) el.appendChild(cur);

      this.loop(function (t) {
        var p = dur <= 0 ? 1 : clamp01((t - at) / dur);
        var n = Math.round(ease(p) * full.length);
        span.textContent = full.slice(0, n);
        if (caret) {
          /* Blink at 1.06 Hz, derived from t so it never desyncs on export. */
          var active = t >= at - 200 && t <= at + dur + 900;
          cur.style.opacity = active ? (Math.floor(t / 530) % 2 ? 0.15 : 1) : 0;
        }
      });
    }, this);
    return this;
  };

  /* Number counter. Use .tnum (tabular-nums) on the element or the digits
     will shift width as they change and the whole line will wobble. */
  Timeline.prototype.count = function (target, cfg) {
    var els = toArray(target);
    if (!els.length) return this;
    var at = cfg.at || 0;
    var dur = cfg.dur === undefined ? 1200 : cfg.dur;
    var ease = resolveEase(cfg.ease || 'outExpo');
    var from = cfg.from === undefined ? 0 : cfg.from;
    var to = cfg.to === undefined ? 100 : cfg.to;
    var dec = cfg.decimals || 0;
    var prefix = cfg.prefix || '';
    var suffix = cfg.suffix || '';
    var sep = cfg.separator;

    els.forEach(function (el) {
      this.loop(function (t) {
        var p = dur <= 0 ? 1 : clamp01((t - at) / dur);
        var v = lerp(from, to, ease(p));
        var s = v.toFixed(dec);
        if (sep) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
        el.textContent = prefix + s + suffix;
      });
    }, this);
    return this;
  };

  /* SHAPE MORPH.

       tl.morph('[data-el="icon"] path', {
         at: 1200, dur: 520, ease: 'inOutCubic',
         d: ['M0 0 L24 0 L24 24 Z', 'M0 0 L24 12 L12 24 Z']
       })

     Morphs SVG path `d` (or `points`, or a CSS `clipPath`) by structural
     interpolation. There is no path-normalization library in here on purpose —
     see "Shape morphing" in the prose. The two shapes must already correspond:
     same command letters in the same order, same number of coordinates.

     THIS THROWS on a mismatch rather than degrading quietly. A morph that
     silently becomes a midpoint snap is the kind of defect you do not notice
     until you are watching the export frame by frame, and by then it is in
     seven other scenes too. Loud, at build time, is better. */
  Timeline.prototype.morph = function (target, cfg) {
    var els = toArray(target);
    var self = this;
    var prop = cfg.points ? 'points' : (cfg.clipPath ? 'clipPath' : 'd');
    var pair = cfg[prop];
    if (!pair || pair.length < 2) {
      throw new Error('tl.morph: needs at least two shapes in `' + prop + '`');
    }

    /* Validate every consecutive pair, so a 3-key morph is checked end to end
       and the error names the leg that is wrong. */
    for (var i = 0; i < pair.length - 1; i++) {
      var why = morphMismatch(pair[i], pair[i + 1]);
      if (why) {
        throw new Error('tl.morph: shapes ' + i + ' and ' + (i + 1) +
          ' do not correspond — ' + why +
          '. Both shapes need the same commands in the same order and the ' +
          'same number of coordinates. Redraw the simpler one with matching ' +
          'points (see "Shape morphing").');
      }
    }

    var key = prop === 'clipPath' ? 'clipPath' : '@' + prop;
    els.forEach(function (el, n) {
      var spec = {
        at: (cfg.at || 0) + n * (cfg.stagger || 0),
        dur: cfg.dur === undefined ? 520 : cfg.dur,
        ease: cfg.ease || 'inOutCubic'
      };
      if (cfg.times) spec.times = cfg.times;
      if (cfg.easeEach) spec.easeEach = cfg.easeEach;
      spec[key] = pair;
      self.add(el, spec);
    });
    return this;
  };

  /* Why two shapes cannot morph, as a human sentence — or null if they can. */
  function morphMismatch(a, b) {
    var sa = numSkeleton(a), sb = numSkeleton(b);
    if (!sa.nums.length) return 'the first shape contains no numbers';
    if (sa.nums.length !== sb.nums.length) {
      return 'they hold ' + sa.nums.length + ' and ' + sb.nums.length +
             ' coordinates';
    }
    if (sa.skel !== sb.skel) {
      var ca = String(a).replace(/[^a-zA-Z]/g, '');
      var cb = String(b).replace(/[^a-zA-Z]/g, '');
      if (ca !== cb) return 'their commands differ (' + ca + ' vs ' + cb + ')';
      return 'their non-numeric structure differs';
    }
    return null;
  }

  /* SVG stroke draw-on. Measures each path and animates dashoffset. */
  Timeline.prototype.draw = function (target, cfg) {
    var els = toArray(target);
    var self = this;
    els.forEach(function (el, i) {
      var len = 0;
      try { len = el.getTotalLength(); } catch (e) { len = 0; }
      if (!len) return;
      el.style.strokeDasharray = len + ' ' + len;
      self.add(el, {
        at: (cfg.at || 0) + i * (cfg.stagger || 0),
        dur: cfg.dur === undefined ? 900 : cfg.dur,
        ease: cfg.ease || 'outQuart',
        strokeDashoffset: [len, 0]
      });
    });
    return this;
  };

  /* PLAYBACK (preview only — the render harness never calls this) */
  Timeline.prototype.play = function () {
    if (this._raf) return this;
    var self = this;
    var last = performance.now();
    if (this.t >= this.duration) this.t = 0;
    var step = function (now) {
      var dt = now - last;
      last = now;
      var next = self.t + dt * (self.rate || 1);
      if (next >= self.duration) {
        next = self.duration;
        self.seek(next);
        self.pause();
        if (self.onUpdate) self.onUpdate(next);
        return;
      }
      self._fireCues(self.t, next);
      self.seek(next);
      if (self.onUpdate) self.onUpdate(next);
      self._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
    this.playing = true;
    return this;
  };

  Timeline.prototype.pause = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.playing = false;
    return this;
  };

  Timeline.prototype.toggle = function () {
    return this.playing ? this.pause() : this.play();
  };

  Timeline.prototype._fireCues = function (from, to) {
    if (!global.SFX || !global.SFX.enabled) return;
    for (var i = 0; i < this.cues.length; i++) {
      var c = this.cues[i];
      if (c.at > from && c.at <= to) global.SFX.play(c.name, c);
    }
  };

  /* splitText — wrap chars / words / lines in spans so they can be staggered.

     'lines' splits on explicit <br> or on \n in the source text. It does NOT
     measure rendered line boxes: that would depend on font metrics, which
     differ between your browser and the headless renderer, which would make
     the export non-deterministic. Author your line breaks explicitly. */
  function splitText(target, mode) {
    mode = mode || 'chars';
    var els = toArray(target);
    var out = [];

    els.forEach(function (el) {
      if (mode === 'lines') {
        var html = el.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        var lines = html.split('\n').map(function (s) { return s.trim(); })
                        .filter(function (s) { return s.length; });
        el.innerHTML = '';
        lines.forEach(function (line) {
          var mask = document.createElement('span');
          mask.className = 'line-mask';
          var inner = document.createElement('span');
          inner.innerHTML = line;
          mask.appendChild(inner);
          el.appendChild(mask);
          out.push(inner);
        });
        return;
      }

      var text = el.textContent;
      el.textContent = '';
      var parts = mode === 'words' ? text.split(/(\s+)/) : text.split('');
      parts.forEach(function (part) {
        if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
        var s = document.createElement('span');
        s.textContent = part;
        s.style.display = 'inline-block';
        s.style.willChange = 'transform, opacity';
        el.appendChild(s);
        out.push(s);
      });
    });
    return out;
  }

  /* MOUNT — stage scaling, preview chrome, and the render harness hook. */
  function mount(tl, opts) {
    opts = opts || {};
    var params = new URLSearchParams(location.search);
    var isRender = params.has('render');

    /* The Timeline dimensions are the single source of truth for canvas size.
       CSS carries defaults (and data-aspect presets) so the stage is centred on
       first paint, but these writes win. */
    document.documentElement.style.setProperty('--stage-w', tl.width + 'px');
    document.documentElement.style.setProperty('--stage-h', tl.height + 'px');

    /* If someone set data-aspect but passed different dimensions to Timeline,
       the preview and the export disagree about the frame. Warn rather than
       silently pick one — a mismatch here produces a correctly-centred preview
       and a wrongly-cropped video, which is a confusing thing to debug later. */
    /* Compare derived pixels, not the ratio. A ratio comparison with a small
       absolute tolerance is weak on tall canvases — 1080x1900 lands 0.0059 from
       9:16, so a 0.01 tolerance would call a 20px error a match. */
    var aspectAttr = document.documentElement.getAttribute('data-aspect');
    if (aspectAttr && /^\d+:\d+$/.test(aspectAttr)) {
      var parts = aspectAttr.split(':');
      var expectH = tl.width * parseFloat(parts[1]) / parseFloat(parts[0]);
      if (Math.abs(tl.height - expectH) > 1) {
        console.warn('[timeline] data-aspect="' + aspectAttr + '" implies ' +
          tl.width + 'x' + Math.round(expectH) + ', but Timeline is ' +
          tl.width + 'x' + tl.height + '. The preview will letterbox ' +
          'differently from the export, which follows the Timeline dimensions.');
      }
    }

    /* Scale the stage down to fit the window. CSS does the centring with a
       transform; this only decides how much to shrink.

       Two things matter here:
       - Never scale ABOVE 1. Upscaling a 1920px canvas on a 4K monitor blurs
         text and glass edges; letterboxing looks deliberate, soft type does not.
       - The bar's height has to reach CSS as `--chrome-h`, because the centring
         offset in `.stage` and the shrink factor computed here must agree on one
         number. If this subtracted the bar height locally while CSS still
         centred on the full window height, the bar would cover the bottom of
         the frame by half its own height.

       The height is measured rather than hardcoded: it follows button padding,
       font-size and line-height, so it moves with the preset and with whatever
       font stack the machine actually resolves. */
    function chromeH() {
      if (isRender) return 0;
      var bar = document.querySelector('.scrub-bar');
      /* offsetHeight is correct even though the bar sits at opacity:0 — it is
         still in flow. Before buildControls() runs there is nothing to measure,
         so use a close estimate and re-fit once the bar exists. */
      return bar ? bar.offsetHeight : 54;
    }

    function fit() {
      var chrome = chromeH();
      document.documentElement.style.setProperty('--chrome-h', chrome + 'px');
      var availH = Math.max(120, innerHeight - chrome);
      var s = Math.min(innerWidth / tl.width, availH / tl.height, 1);
      document.documentElement.style.setProperty('--stage-scale', s);
    }
    fit();

    /* Registered in render mode too. The renderer resizes the viewport to the film's
       own dimensions once the page has loaded — so it can rasterise at a higher device
       pixel ratio rather than upscale a smaller frame — and the stage has to re-fit
       against the new window or it keeps the scale it computed for the old one. In
       render mode chromeH() is 0, so this lands on scale 1 and a perfectly centred
       stage whenever the viewport matches the film. */
    addEventListener('resize', fit);

    if (!isRender) {
      /* orientationchange fires before the new innerHeight is readable on
         mobile Safari, so re-fit on the next frame too. */
      addEventListener('orientationchange', function () {
        requestAnimationFrame(fit);
      });
      /* Browser zoom and OS display-scaling changes alter the CSS pixel ratio
         without firing resize in every browser. */
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', fit);
      }
      /* Late-loading webfonts can change scrollbar/metrics state; cheap insurance. */
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(fit);
      }

      /* THE VIEWER'S POINTER — hidden, but not unconditionally.
         `.stage` hides the OS cursor so the film's own drawn arrow is the only pointer
         on screen. Hiding it whenever the mouse is over the stage means it vanishes the
         instant the viewer crosses the preview and they cannot find their way back to
         the scrub bar — a preview you cannot point at is worse than a second arrow.
         So it is hidden only when it is both unnecessary and unmissed: the film is
         playing and the mouse has been still for a beat. Any movement, click or
         keypress brings it straight back, and a paused film always shows it. */
      var idleTimer = null;
      var wake = function () {
        document.body.classList.remove('cursor-idle');
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(function () {
          if (tl.playing) document.body.classList.add('cursor-idle');
        }, 1400);
      };
      addEventListener('pointermove', wake, { passive: true });
      addEventListener('pointerdown', wake, { passive: true });
      addEventListener('keydown', wake);
      wake();
    }

    if (isRender) {
      document.body.classList.add('render-mode');
      /* Note what is NOT done here: the stage's transform is left alone. `.stage` is
         positioned with top/left 50% and pulled back by translate(-50%, -50%), so
         clearing the transform would put its top-left corner at the window centre and
         push three quarters of the film off-frame. Render mode changes the scale (via
         chromeH() returning 0 and fit() running against the full window), never the
         centring. */
    }

    tl.seek(0);

    /* The render harness contract. Puppeteer waits for ready, then calls
       seek(ms) once per frame and screenshots. Keep this shape stable. */
    global.__EXPLAINER__ = {
      version: 1,
      ready: false,
      duration: tl.duration,
      fps: tl.fps,
      width: tl.width,
      height: tl.height,
      frames: Math.round(tl.duration / 1000 * tl.fps),
      seek: function (ms) { tl.seek(ms); return ms; },
      seekFrame: function (f) { tl.seek(f * 1000 / tl.fps); return f; },
      cues: tl.cues,
      timeline: tl,
      /* Returns a Promise<base64 WAV> so the render harness can pull the
         soundtrack across the CDP boundary as a plain JSON string. */
      renderAudio: function (sampleRate) {
        if (!global.SFX || !global.SFX.renderWavBase64) return Promise.resolve(null);
        return global.SFX.renderWavBase64(tl.cues, tl.duration, sampleRate || 48000);
      }
    };

    /* Fonts must be settled before the first screenshot or frame 1 renders in
       a fallback face and every later frame is a different width. */
    var markReady = function () { global.__EXPLAINER__.ready = true; };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { requestAnimationFrame(markReady); });
    } else {
      requestAnimationFrame(markReady);
    }

    if (!isRender && opts.controls !== false) {
      buildControls(tl);
      /* Now the bar exists, so chromeH() can measure it instead of guessing.
         Without this re-fit the film is centred against the 54px estimate and
         sits a few px off whenever the real bar is a different height. */
      fit();
    }
    return tl;
  }

  function fmtTime(ms) {
    var s = ms / 1000;
    var m = Math.floor(s / 60);
    var r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
  }

  function buildControls(tl) {
    var bar = document.createElement('div');
    bar.className = 'preview-ui scrub-bar';
    bar.innerHTML =
      '<button data-act="play">Play</button>' +
      '<span class="tc"></span>' +
      '<input type="range" min="0" max="' + tl.duration + '" value="0" step="1">' +
      '<span class="scene-name"></span>' +
      '<button data-act="sound">Sound: off</button>';
    document.body.appendChild(bar);

    var range = bar.querySelector('input');
    var tc = bar.querySelector('.tc');
    var sn = bar.querySelector('.scene-name');
    var playBtn = bar.querySelector('[data-act="play"]');
    var soundBtn = bar.querySelector('[data-act="sound"]');
    var frameMs = 1000 / tl.fps;

    function sync(t) {
      range.value = t;
      tc.textContent = fmtTime(t) + ' / ' + fmtTime(tl.duration) +
                       '  f' + Math.round(t / frameMs);
      sn.textContent = tl.sceneAt(t);
      playBtn.textContent = tl.playing ? 'Pause' : 'Play';
    }
    tl.onUpdate = sync;

    range.addEventListener('input', function () {
      tl.pause();
      tl.seek(+range.value);
      sync(+range.value);
    });
    playBtn.addEventListener('click', function () { tl.toggle(); sync(tl.t); });
    soundBtn.addEventListener('click', function () {
      if (!global.SFX) return;
      var on = global.SFX.toggle();
      soundBtn.textContent = 'Sound: ' + (on ? 'on' : 'off');
    });

    addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); tl.toggle(); sync(tl.t); }
      else if (e.key === 'ArrowRight') {
        tl.pause();
        tl.seek(tl.t + (e.shiftKey ? frameMs * 10 : frameMs));
        sync(tl.t);
      } else if (e.key === 'ArrowLeft') {
        tl.pause();
        tl.seek(tl.t - (e.shiftKey ? frameMs * 10 : frameMs));
        sync(tl.t);
      } else if (e.key === 'Home') { tl.pause(); tl.seek(0); sync(0); }
      else if (e.key === 'End') { tl.pause(); tl.seek(tl.duration); sync(tl.duration); }
      else if (e.key === 'g') {
        var g = document.querySelector('.safe-guide');
        if (g) g.style.display = g.style.display === 'none' ? '' : 'none';
      }
    });

    sync(0);
  }

  Timeline.prototype.mount = function (opts) { return mount(this, opts); };

  global.Ease = Ease;
  global.Timeline = Timeline;
  global.splitText = splitText;

}(window));
```

### `assets/sfx.js`

```js
/* sfx.js — procedural sound design. Every sound is synthesized from
   oscillators and noise; there are no sample files, so nothing to license,
   download, or ship.

   Same cue list drives two paths:
     live     — AudioContext, for preview in the browser
     offline  — OfflineAudioContext -> WAV bytes, for muxing into the MP4

   Because both paths run identical graph-building code, what you hear while
   scrubbing is what lands in the exported file.

   Design notes that matter for it not sounding cheap:
   - Decay uses exponentialRampToValueAtTime. Linear fades on amplitude sound
     synthetic; exponential matches how physical resonances actually die out.
   - Every envelope gets a 1.5-4ms attack. Starting a gain at full value
     produces a discontinuity that clicks audibly.
   - exponentialRampToValueAtTime can never reach or pass through 0, so targets
     land on 0.0001 and then hard-stop.
   - Randomness is seeded from the cue index, never Math.random(), so an
     exported soundtrack is reproducible. */
(function (global) {
  'use strict';

  var EPS = 0.0001;

  function seededRand(i, salt) {
    var x = Math.sin((i + 1) * 12.9898 + (salt || 0) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /* Noise buffer, generated once per context. Pink-ish: white noise run
     through a simple one-pole lowpass, which is cheaper than a proper
     Voss-McCartney generator and sits better under UI sounds than raw white. */
  function noiseBuffer(ctx, seed) {
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = seededRand(i, seed || 1) * 2 - 1;
      last = 0.72 * last + 0.28 * w;
      d[i] = last * 1.4;
    }
    return buf;
  }

  /* ADSR-ish envelope. attack -> optional hold -> exponential decay. */
  function env(g, t0, peak, attack, decay, hold) {
    hold = hold || 0;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(EPS, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, EPS), t0 + attack);
    if (hold > 0) g.gain.setValueAtTime(Math.max(peak, EPS), t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(EPS, t0 + attack + hold + decay);
    return t0 + attack + hold + decay;
  }

  /* VOICES
     Each takes (ctx, dest, t0, o) and returns the time it finishes.
     o.gain scales level, o.pitch multiplies frequency — so one recipe can be
     reused at several pitches for variation. */
  var Voices = {};

  /* Soft UI click. Short filtered noise transient with a tiny tonal body so
     it reads as a physical tap rather than a static pop. */
  Voices.click = function (ctx, dest, t0, o) {
    var lvl = (o.gain || 1) * 0.30;
    var src = ctx.createBufferSource();
    src.buffer = ctx._noise;
    src.playbackRate.value = 1 + (o.pitch ? (o.pitch - 1) * 0.5 : 0);
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100 * (o.pitch || 1);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 * (o.pitch || 1);
    bp.Q.value = 0.9;
    var g = ctx.createGain();
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest);
    var end = env(g, t0, lvl, 0.0015, 0.030);
    src.start(t0); src.stop(end + 0.01);

    var body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(1750 * (o.pitch || 1), t0);
    body.frequency.exponentialRampToValueAtTime(880 * (o.pitch || 1), t0 + 0.035);
    var bg = ctx.createGain();
    body.connect(bg); bg.connect(dest);
    env(bg, t0, lvl * 0.5, 0.001, 0.032);
    body.start(t0); body.stop(t0 + 0.08);
    return end;
  };

  /* Tick — drier and higher than click. For counters, ticks, small state. */
  Voices.tick = function (ctx, dest, t0, o) {
    var lvl = (o.gain || 1) * 0.18;
    var src = ctx.createBufferSource();
    src.buffer = ctx._noise;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200 * (o.pitch || 1);
    bp.Q.value = 2.2;
    var g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(dest);
    var end = env(g, t0, lvl, 0.001, 0.018);
    src.start(t0); src.stop(end + 0.01);
    return end;
  };

  /* Keyboard tap, for typewriter scenes. Pitch and level jitter per index or
     the run turns into a machine-gun rattle. */
  Voices.key = function (ctx, dest, t0, o) {
    var i = o.i || 0;
    var jitter = 0.86 + seededRand(i, 3) * 0.30;
    return Voices.click(ctx, dest, t0, {
      gain: (o.gain || 1) * (0.42 + seededRand(i, 5) * 0.16),
      pitch: jitter * 1.25
    });
  };

  /* Pop / bubble. Fast upward pitch bend on a sine — the classic "appear". */
  Voices.pop = function (ctx, dest, t0, o) {
    var lvl = (o.gain || 1) * 0.26;
    var f = 420 * (o.pitch || 1);
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * 2.3, t0 + 0.075);
    var g = ctx.createGain();
    osc.connect(g); g.connect(dest);
    var end = env(g, t0, lvl, 0.004, 0.085);
    osc.start(t0); osc.stop(end + 0.02);
    return end;
  };

  /* Whoosh. Bandpass sweep across noise — the workhorse transition sound.
     The sweep goes up then back down, which reads as movement past the
     listener rather than a simple filter open. */
  Voices.whoosh = function (ctx, dest, t0, o) {
    var dur = (o.dur || 620) / 1000;
    var lvl = (o.gain || 1) * 0.17;
    var src = ctx.createBufferSource();
    src.buffer = ctx._noise;
    src.playbackRate.value = 0.85;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.15;
    bp.frequency.setValueAtTime(260, t0);
    bp.frequency.exponentialRampToValueAtTime(2900 * (o.pitch || 1), t0 + dur * 0.52);
    bp.frequency.exponentialRampToValueAtTime(420, t0 + dur);
    var g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(EPS, t0);
    g.gain.exponentialRampToValueAtTime(lvl, t0 + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(EPS, t0 + dur);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return t0 + dur;
  };

  /* Sub thump. Scene hits and logo stings. Sine dropping into the sub range,
     plus a click transient so it still reads on laptop speakers that cannot
     reproduce 45 Hz at all. */
  Voices.thump = function (ctx, dest, t0, o) {
    var lvl = (o.gain || 1) * 0.62;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110 * (o.pitch || 1), t0);
    osc.frequency.exponentialRampToValueAtTime(42 * (o.pitch || 1), t0 + 0.16);
    var g = ctx.createGain();
    osc.connect(g); g.connect(dest);
    var end = env(g, t0, lvl, 0.005, 0.30);
    osc.start(t0); osc.stop(end + 0.05);
    Voices.click(ctx, dest, t0, { gain: (o.gain || 1) * 0.30, pitch: 0.55 });
    return end;
  };

  /* Chime. Two partials a perfect fifth apart (3:2), slightly detuned, with
     the upper partial decaying faster — that ratio is why it reads "Apple"
     rather than "video game". */
  Voices.chime = function (ctx, dest, t0, o) {
    var base = (o.freq || 880) * (o.pitch || 1);
    var lvl = (o.gain || 1) * 0.20;
    var end = t0;
    [[1, 1, 0.62], [1.5, 0.55, 0.44], [2.005, 0.16, 0.30]].forEach(function (p) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * p[0];
      var g = ctx.createGain();
      osc.connect(g); g.connect(dest);
      var e = env(g, t0, lvl * p[1], 0.006, p[2]);
      osc.start(t0); osc.stop(e + 0.05);
      if (e > end) end = e;
    });
    return end;
  };

  /* Success. Ascending major triad, 70ms apart. Short enough to feel like one
     gesture rather than a melody. */
  Voices.success = function (ctx, dest, t0, o) {
    var notes = [523.25, 659.25, 783.99];   /* C5 E5 G5 */
    var end = t0;
    notes.forEach(function (f, i) {
      var e = Voices.chime(ctx, dest, t0 + i * 0.070, {
        freq: f, gain: (o.gain || 1) * 0.82
      });
      if (e > end) end = e;
    });
    return end;
  };

  /* Error. Descending minor second, detuned — dissonant without being harsh. */
  Voices.error = function (ctx, dest, t0, o) {
    var lvl = (o.gain || 1) * 0.16;
    var end = t0;
    [[233.08, 0], [220.00, 0.055]].forEach(function (p) {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = p[0];
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      var g = ctx.createGain();
      osc.connect(lp); lp.connect(g); g.connect(dest);
      var e = env(g, t0 + p[1], lvl, 0.006, 0.26);
      osc.start(t0 + p[1]); osc.stop(e + 0.05);
      if (e > end) end = e;
    });
    return end;
  };

  /* Riser. Tension build into a reveal. Noise sweeping up plus a rising sine;
     end it exactly on the beat it resolves to. */
  Voices.riser = function (ctx, dest, t0, o) {
    var dur = (o.dur || 1200) / 1000;
    var lvl = (o.gain || 1) * 0.13;
    var src = ctx.createBufferSource();
    src.buffer = ctx._noise;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(5200, t0 + dur);
    var g = ctx.createGain();
    src.connect(bp); bp.connect(g); g.connect(dest);
    g.gain.setValueAtTime(EPS, t0);
    g.gain.exponentialRampToValueAtTime(lvl, t0 + dur * 0.88);
    g.gain.exponentialRampToValueAtTime(EPS, t0 + dur);
    src.start(t0); src.stop(t0 + dur + 0.05);

    var osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(720, t0 + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    var og = ctx.createGain();
    osc.connect(lp); lp.connect(og); og.connect(dest);
    og.gain.setValueAtTime(EPS, t0);
    og.gain.exponentialRampToValueAtTime(lvl * 0.5, t0 + dur * 0.9);
    og.gain.exponentialRampToValueAtTime(EPS, t0 + dur);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return t0 + dur;
  };

  /* Toggle. Two-state, pitch direction encodes on vs off. */
  Voices.toggle = function (ctx, dest, t0, o) {
    return Voices.pop(ctx, dest, t0, {
      gain: (o.gain || 1) * 0.7,
      pitch: o.on === false ? 0.62 : 1.18
    });
  };

  /* Ambient pad. Detuned sine stack, very slow attack, sits at the bottom of
     the mix. This is the bed that makes silence feel intentional. */
  Voices.pad = function (ctx, dest, t0, o) {
    var dur = (o.dur || 6000) / 1000;
    var root = o.freq || 110;
    var lvl = (o.gain || 1) * 0.055;
    var end = t0 + dur;
    /* Root, fifth, octave, plus gentle detunes for movement. */
    [[1, 0], [1.5, 4], [2, -5], [3, 3]].forEach(function (p, i) {
      var osc = ctx.createOscillator();
      osc.type = i === 3 ? 'sine' : 'triangle';
      osc.frequency.value = root * p[0];
      osc.detune.value = p[1];
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      var g = ctx.createGain();
      osc.connect(lp); lp.connect(g); g.connect(dest);
      var amp = lvl * (i === 3 ? 0.25 : 1);
      g.gain.setValueAtTime(EPS, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + Math.min(1.6, dur * 0.3));
      g.gain.setValueAtTime(amp, t0 + dur - 1.4);
      g.gain.exponentialRampToValueAtTime(EPS, t0 + dur);
      osc.start(t0); osc.stop(end + 0.1);
    });
    return end;
  };

  /* Aliases so cue names can read naturally in a beat sheet. */
  Voices.transition = Voices.whoosh;
  Voices.impact = Voices.thump;
  Voices.notify = Voices.chime;
  Voices.appear = Voices.pop;

  /* MASTER CHAIN
     Compressor for glue, then a soft-clip waveshaper acting as a limiter, then
     master gain. Without the limiter, a thump landing on the same frame as a
     whoosh and a chime will clip and crackle. */
  function softClipCurve() {
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 1.35) * 0.92;
    }
    return c;
  }

  function makeMaster(ctx, level) {
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;

    var shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = '4x';

    var out = ctx.createGain();
    out.gain.value = level === undefined ? 0.85 : level;

    comp.connect(shaper);
    shaper.connect(out);
    out.connect(ctx.destination);
    ctx._noise = noiseBuffer(ctx, 1);
    return comp;
  }

  /* MUSIC BED
     Slow suspended-chord pad progression. Deliberately static and low — a bed
     exists to remove the feeling of dead air, not to be listened to. Four
     chords over the whole piece, root movement only. */
  var BED_ROOTS = [110.00, 123.47, 98.00, 130.81];   /* A2 B2 G2 C3 */

  function scheduleBed(ctx, dest, durationMs, gain) {
    var chordMs = 7000;
    var n = Math.max(1, Math.ceil(durationMs / chordMs));
    for (var i = 0; i < n; i++) {
      var at = i * chordMs / 1000;
      var len = Math.min(chordMs + 1800, durationMs - i * chordMs + 1800);
      Voices.pad(ctx, dest, at, {
        freq: BED_ROOTS[i % BED_ROOTS.length],
        dur: len,
        gain: gain === undefined ? 1 : gain
      });
    }
  }

  /* WAV ENCODING
     AudioBuffer -> 16-bit PCM WAV bytes. ffmpeg reads this directly, so the
     export path is: render offline -> WAV -> mux. No encoder dependency. */
  function audioBufferToWav(buf) {
    var numCh = buf.numberOfChannels;
    var len = buf.length;
    var sr = buf.sampleRate;
    var bytes = 44 + len * numCh * 2;
    var ab = new ArrayBuffer(bytes);
    var view = new DataView(ab);

    function str(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }

    str(0, 'RIFF');
    view.setUint32(4, bytes - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);        /* PCM chunk size   */
    view.setUint16(20, 1, true);         /* format = PCM     */
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, len * numCh * 2, true);

    var chans = [];
    for (var c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));

    var off = 44;
    for (var i = 0; i < len; i++) {
      for (var ch = 0; ch < numCh; ch++) {
        var s = Math.max(-1, Math.min(1, chans[ch][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Uint8Array(ab);
  }

  function bytesToBase64(u8) {
    var s = '', chunk = 0x8000;
    for (var i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  /* PUBLIC API */
  var liveCtx = null, liveBus = null;

  var SFX = {
    enabled: false,
    masterGain: 0.85,
    bedGain: 1,

    voices: Voices,

    /* Browsers block audio until a user gesture, so the context is created
       lazily on first toggle rather than at load. */
    init: function () {
      if (liveCtx) return liveCtx;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      liveCtx = new AC();
      liveBus = makeMaster(liveCtx, this.masterGain);
      return liveCtx;
    },

    toggle: function () {
      this.enabled = !this.enabled;
      if (this.enabled) {
        var c = this.init();
        if (c && c.state === 'suspended') c.resume();
      }
      return this.enabled;
    },

    /* Fire a cue live. Called by Timeline._fireCues during preview. */
    play: function (name, opts) {
      if (!this.enabled) return;
      var ctx = this.init();
      if (!ctx) return;
      var v = Voices[name];
      if (!v) return;
      v(ctx, liveBus, ctx.currentTime + 0.005, opts || {});
    },

    /* Render the entire soundtrack offline and return WAV bytes.
       Deterministic: same cue list in, byte-identical WAV out. */
    renderWav: function (cues, durationMs, sampleRate) {
      var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
      if (!OAC) return Promise.resolve(null);
      sampleRate = sampleRate || 48000;
      var tail = 1.2;   /* let final reverb/decay finish */
      var frames = Math.ceil((durationMs / 1000 + tail) * sampleRate);
      var ctx = new OAC(2, frames, sampleRate);
      var bus = makeMaster(ctx, this.masterGain);

      if (this.bedGain > 0) scheduleBed(ctx, bus, durationMs, this.bedGain);

      (cues || []).forEach(function (c, i) {
        var v = Voices[c.name];
        if (!v) return;
        var o = Object.assign({ i: i }, c);
        v(ctx, bus, c.at / 1000, o);
      });

      return ctx.startRendering().then(function (buf) {
        return audioBufferToWav(buf);
      });
    },

    /* Convenience for the render harness: returns base64 so the WAV can cross
       the CDP boundary as a JSON string. */
    renderWavBase64: function (cues, durationMs, sampleRate) {
      return SFX.renderWav(cues, durationMs, sampleRate).then(function (u8) {
        return u8 ? bytesToBase64(u8) : null;
      });
    },

    /* Preview the soundtrack as a downloadable file. */
    downloadWav: function (cues, durationMs) {
      SFX.renderWav(cues, durationMs).then(function (u8) {
        if (!u8) return;
        var blob = new Blob([u8], { type: 'audio/wav' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'explainer-audio.wav';
        a.click();
      });
    },

    audioBufferToWav: audioBufferToWav
  };

  global.SFX = SFX;

}(window));
```

### `templates/glass-filters.svg`

```svg
<!--
  glass-filters.svg — the real refraction filter for .glass-lens

  HOW TO USE
  Paste this whole block as the FIRST child of <body>. It cannot be an
  <img src> or an external <use>: backdrop-filter: url(#lens) only resolves
  against a filter in the same document tree.

  WHAT IT DOES
  feDisplacementMap bends the backdrop using a normal map. That bending is the
  actual difference between Liquid Glass and a plain frosted blur: a blur
  averages what is behind the panel, refraction MOVES it, so straight lines
  behind the edge visibly kink. Blur cannot do that at any radius.

  The map is generated with feTurbulence at very low frequency, then heavily
  blurred, which yields smooth large-scale gradients rather than noise. Feeding
  raw turbulence into a displacement map is what produces that cheap "frosted
  bathroom window" look.

  HONEST CAVEATS — read before shipping
  1. Chromium only. Firefox and Safari ignore url() in backdrop-filter. The
     @supports guard in explainer.css means those browsers just get the
     blur+highlight stack, which still reads as glass.
  2. Edge lensing here is approximate. Apple's real implementation displaces
     most strongly at the rim and falls off toward the centre, driven by the
     shape's own signed-distance field. In a backdrop-filter context SourceAlpha
     is an opaque rect clipped to the border box, so the falloff below follows
     the rectangular box and ignores border-radius. On a rounded panel the
     corners get slightly less lensing than they should. Nobody notices at
     video scale; do not build a hero shot around a close-up of one corner.
  3. Unverified under headless capture. I could not test whether Chromium's
     headless compositor rasterises url() backdrop-filters identically to
     headed mode — no Chrome binary was installable in the authoring sandbox.
     If exported frames show the glass flat, re-render with --swiftshader, and
     if that still fails drop .glass-lens and keep .glass.
-->
<svg width="0" height="0" style="position:absolute;pointer-events:none"
     aria-hidden="true" focusable="false">
  <defs>

    <!-- ===================================================================
         #lens — the general-purpose refraction filter.
         Wire it up with: backdrop-filter: blur(1px) url(#lens) blur(2px) ...
         The pre-blur softens the source so displacement does not smear
         individual pixels; the post-blur hides feDisplacementMap's lack of
         supersampling, which otherwise shows as stair-stepping on edges.
         =================================================================== -->
    <filter id="lens" x="-15%" y="-15%" width="130%" height="130%"
            color-interpolation-filters="sRGB">

      <!-- Large, slow-varying noise. baseFrequency this low is the whole
           trick: 0.008 gives features ~125px across at 1x, i.e. gentle
           lensing rather than visible grain. -->
      <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012"
                    numOctaves="2" seed="11" stitchTiles="stitch"
                    result="rawNoise"/>

      <!-- Smooth it into a usable normal map. Without this the displacement
           reads as texture instead of curvature. -->
      <feGaussianBlur in="rawNoise" stdDeviation="9" result="softNoise"/>

      <!-- Boost contrast in R and G (the channels the displacement reads) so
           the effect is visible after blurring flattened it. -->
      <feComponentTransfer in="softNoise" result="normalMap">
        <feFuncR type="linear" slope="2.4" intercept="-0.7"/>
        <feFuncG type="linear" slope="2.4" intercept="-0.7"/>
        <feFuncB type="linear" slope="0"   intercept="0.5"/>
      </feComponentTransfer>

      <!-- Rim weighting. Blur the element's own alpha, then invert it, to get
           a mask that is bright at the edges and dark in the middle. -->
      <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="alphaSoft"/>
      <feComponentTransfer in="alphaSoft" result="rimMask">
        <feFuncA type="table" tableValues="1 0.35 0"/>
      </feComponentTransfer>

      <!-- Multiply the normal map by the rim mask so displacement concentrates
           near the edge, which is where real glass bends light most. -->
      <feComposite in="normalMap" in2="rimMask" operator="in" result="rimNormal"/>

      <!-- The displacement itself. scale is in px at 1x. 18 is a confident
           but believable amount for a panel 400-900px wide; above ~40 it
           stops looking like glass and starts looking like a heat wave. -->
      <feDisplacementMap in="SourceGraphic" in2="rimNormal"
                         scale="18"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>

    <!-- ===================================================================
         #lens-soft — half the displacement. Use behind body text, where any
         refraction at all starts to cost legibility.
         =================================================================== -->
    <filter id="lens-soft" x="-12%" y="-12%" width="124%" height="124%"
            color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009"
                    numOctaves="2" seed="7" stitchTiles="stitch" result="n"/>
      <feGaussianBlur in="n" stdDeviation="12" result="s"/>
      <feComponentTransfer in="s" result="m">
        <feFuncR type="linear" slope="1.8" intercept="-0.4"/>
        <feFuncG type="linear" slope="1.8" intercept="-0.4"/>
      </feComponentTransfer>
      <feDisplacementMap in="SourceGraphic" in2="m" scale="8"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>

    <!-- ===================================================================
         #lens-strong — for a hero shot where the glass IS the subject and you
         want the bend to be unmistakable. Too much for anything with text.
         =================================================================== -->
    <filter id="lens-strong" x="-20%" y="-20%" width="140%" height="140%"
            color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.010 0.014"
                    numOctaves="3" seed="23" stitchTiles="stitch" result="n"/>
      <feGaussianBlur in="n" stdDeviation="7" result="s"/>
      <feComponentTransfer in="s" result="m">
        <feFuncR type="linear" slope="3.1" intercept="-1.0"/>
        <feFuncG type="linear" slope="3.1" intercept="-1.0"/>
      </feComponentTransfer>
      <feGaussianBlur in="SourceAlpha" stdDeviation="22" result="a"/>
      <feComponentTransfer in="a" result="rim">
        <feFuncA type="table" tableValues="1 0.5 0.05"/>
      </feComponentTransfer>
      <feComposite in="m" in2="rim" operator="in" result="rn"/>
      <feDisplacementMap in="SourceGraphic" in2="rn" scale="34"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>

    <!-- ===================================================================
         #grain-fine — film grain as a filter, for when you want it over the
         whole frame rather than per-panel. Cheaper than the base64 PNG in
         .grain because there is no image decode.
         Apply to a full-bleed div with opacity .03-.05.
         =================================================================== -->
    <filter id="grain-fine" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3"
                    stitchTiles="stitch" seed="3" result="g"/>
      <feColorMatrix in="g" type="saturate" values="0"/>
    </filter>

  </defs>
</svg>
```

### `templates/starter.html`

```html
<!DOCTYPE html>
<!--
  starter.html — copy this to begin a new explainer.

  It is a working 3-scene film, deliberately minimal: hook, reveal, end card.
  Delete what you do not need, add scenes as you go. The point is that it runs
  the moment you open it, so you are editing something alive rather than
  assembling something dead.

  Open it in a browser and press space. Arrow keys step one frame. The stage is
  centred in the window with equal letterboxing — that is .viewport's job, so do
  not add margins or positioning to .stage.

  ASPECT RATIO — set it here and in starter.timeline.js, and keep them in sync:
    data-aspect="16:9"  1920x1080  landing pages, YouTube   (default)
    data-aspect="1:1"   1080x1080  square feed posts
    data-aspect="9:16"  1080x1920  stories, Reels, Shorts
    data-aspect="4:5"   1080x1350  portrait feed
  Changing it here resizes the canvas and steps the type scale down, but the
  scene contents are hand-placed pixels — a vertical cut needs the layout
  reworked, not just the frame swapped. Decide before writing scenes.

  Paths assume this file sits one level below the skill root, i.e.
  your-project/starter.html next to your-project/assets/. Adjust if not.
-->
<html lang="en" data-preset="apple" data-aspect="16:9">
<head>
<meta charset="utf-8">
<title>Explainer — starter</title>
<link rel="stylesheet" href="../assets/explainer.css">
<link rel="stylesheet" href="../assets/components.css">
</head>
<body>

<!-- Paste templates/glass-filters.svg here as the first child of <body> if you
     want real refraction on .glass-lens panels. It must be inline in this
     document — an external file will not resolve. -->

<div class="viewport">
<div class="stage">
<!-- The camera wraps every scene. Animate THIS for push-ins, pans, and
     cursor-led zooms — never .stage, and never the scene children. Transform on
     an ancestor is safe for Liquid Glass; opacity/filter/mask are not, so move
     and scale this freely but never fade it. -->
<div class="camera" data-el="camera">

  <!-- ================= S1 HOOK — show the problem ================= -->
  <section class="scene" data-scene="hook">
    <div class="bg-vignette"></div>

    <div class="abs" style="left:210px; top:210px; width:900px;">
      <div class="t-eyebrow" data-el="eyebrow" style="margin-bottom:26px;">
        Tuesday, 4:40 PM
      </div>
      <div class="rows" style="position:relative; height:300px;">
        <!-- Repetition is the argument. Six near-identical rows say "this is
             every day" better than a sentence claiming it. -->
        <div class="row-item" data-el="q" style="position:absolute; left:0; right:0; top:0px;">
          <div class="avatar"></div><span class="name">Where is my invoice?</span>
        </div>
        <div class="row-item" data-el="q" style="position:absolute; left:0; right:0; top:56px;">
          <div class="avatar"></div><span class="name">Invoice for March missing</span>
        </div>
        <div class="row-item" data-el="q" style="position:absolute; left:0; right:0; top:112px;">
          <div class="avatar"></div><span class="name">Can you resend the invoice?</span>
        </div>
        <div class="row-item" data-el="q" style="position:absolute; left:0; right:0; top:168px;">
          <div class="avatar"></div><span class="name">no invoice in my email</span>
        </div>
        <div class="row-item" data-el="q" style="position:absolute; left:0; right:0; top:224px;">
          <div class="avatar"></div><span class="name">Invoice request — urgent</span>
        </div>
      </div>
    </div>

    <!-- The headline arrives AFTER the visual has landed. It confirms what the
         viewer already noticed, which reads as agreement, not assertion. -->
    <div class="abs" style="left:1220px; top:420px; width:520px;">
      <div class="t-display" data-el="hook-line">Same question.<br>Every day.</div>
    </div>
  </section>

  <!-- ================= S2 REVEAL — hard cut to the product ================= -->
  <section class="scene" data-scene="reveal">
    <div class="bg-aurora" data-el="aurora"></div>
    <div class="bg-vignette"></div>

    <!-- NOTE the split: transform on the wrapper, opacity on the glass itself.
         Fading this wrapper would make it a backdrop root and flatten the
         glass inside it. See "The backdrop-root trap". -->
    <div class="abs" data-el="hero-wrap"
         style="left:460px; top:340px; width:1000px; height:400px;">
      <div class="glass glass-solid" data-el="hero-glass" style="position:absolute; inset:0;">
        <div class="sheen" data-el="sheen"></div>
        <div class="grain"></div>
      </div>
      <div class="abs" style="left:0; right:0; top:104px; text-align:center;">
        <div class="logo-lockup" data-el="lock" style="justify-content:center; margin-bottom:28px;">
          <div class="logo-mark"></div>
          <div class="logo-word">Yourproduct</div>
        </div>
        <div class="t-headline" data-el="tag" style="color:var(--label-2); font-weight:400;">
          One sentence. What it does, not what it is.
        </div>
      </div>
    </div>
  </section>

  <!-- ================= S3 END CARD — one action ================= -->
  <section class="scene" data-scene="end">
    <div class="bg-aurora" data-el="end-aurora" style="opacity:.7"></div>
    <div class="bg-vignette"></div>

    <div class="abs" style="left:0; right:0; top:410px; text-align:center;">
      <div class="logo-lockup" data-el="end-lock" style="justify-content:center;">
        <div class="logo-mark"></div>
        <div class="logo-word">Yourproduct</div>
      </div>
      <div class="row" data-el="end-cta" style="justify-content:center; margin-top:44px; gap:16px;">
        <div class="btn btn-primary btn-lg">Start free</div>
        <div class="t-body" style="color:var(--label-3);">yourproduct.com</div>
      </div>
    </div>
  </section>


  <!-- Cursor + click ring. Last children of .camera on purpose:
       - outside every scene, so a cut does not take the cursor with it;
       - inside .camera, so they scale with a push-in the way a real screen
         recording would.
       ONE pair for the whole film, driven by tl.cursorTo(), which aims at an
       ELEMENT and derives the coordinates so they survive a layout change.

       The path's TIP is at (0,0) — the element's own top-left — so the x/y the
       engine writes lands on the tip with no offset maths anywhere.
       Style it by adding one class: .cursor--glass, .cursor--accent,
       .cursor--outline, or .cursor--soft. The shape stays an arrow either way. -->
  <svg class="cursor" data-el="cursor" viewBox="0 0 13.4 18.9"
       style="left:0; top:0; opacity:0;" aria-hidden="true">
    <path d="M0 0 L0 16.5 L4.2 12.6 L6.9 18.9 L9.7 17.7 L7 11.5 L13.4 11.5 Z"/>
  </svg>
  <div class="click-ring" data-el="ring" style="left:0; top:0;"></div>

</div><!-- /camera -->
</div><!-- /stage -->
</div><!-- /viewport -->

<script src="../assets/sfx.js"></script>
<script src="../assets/timeline.js"></script>
<script src="./starter.timeline.js"></script>
</body>
</html>
```

### `templates/starter.timeline.js`

```js
/* ============================================================================
   starter.timeline.js — the timing for templates/starter.html

   Read this top to bottom; it is meant to be edited, not extended. Every
   pattern worth copying appears once: staggered entrance, compound move,
   overlap, hard cut, hold, and the wrapper/glass opacity split.

   The one rule: all timing lives here. Nothing in the HTML animates.
   ============================================================================ */
(function () {
  'use strict';

  /* Single source of truth for scene timing. Moving a scene is one edit here,
     not a hunt through offsets. [start, duration] in ms.

     NOTE THE OVERLAPS: reveal starts 300ms before hook ends, end starts 300ms
     before reveal ends. Scene ranges are allowed to overlap — each scene stays
     alive for its own window and they stack absolutely. The overlap is what
     stops the film dead-halting at every cut: the outgoing scene is still
     resolving while the incoming one has already begun. Hard cut, no dissolve,
     but never a full stop. */
  var SCENES = {
    hook:   [0,     6000],   /* 0     -> 6000  */
    reveal: [5700,  5300],   /* 5700  -> 11000 */
    end:    [10700, 3800]    /* 10700 -> 14500 */
  };
  var TOTAL = 14500;

  /* Hard cuts. A crossfade between scenes reads as slideshow, and a scene-level
     opacity fade would flatten any glass inside it. */
  var CUT = { fade: 0 };

  var tl = new Timeline({
    duration: TOTAL, fps: 60, width: 1920, height: 1080
  });

  /* ==========================================================================
     S1 — HOOK
     ========================================================================== */
  var s1 = tl.scene('hook', SCENES.hook[0], SCENES.hook[1], CUT);

  /* Rest pose first. Without this the rows would inherit their pending value
     from the first record, which happens to be correct here — but relying on
     that is how you get a mystery later. Be explicit. */
  s1.set('[data-el="eyebrow"]', { opacity: 0, y: 12 });
  s1.set('[data-el="q"]',       { opacity: 0, y: 26 });
  s1.set('[data-el="hook-line"]', { opacity: 0, y: 30 });

  s1.add('[data-el="eyebrow"]', {
    at: 200, dur: 520, ease: 'outQuart', opacity: [0, 1], y: [12, 0]
  });

  /* Staggered entrance. 170ms is at the loose end on purpose: each row should
     register as a separate arrival, because the count is the point. */
  s1.add('[data-el="q"]', {
    at: 500, dur: 620, ease: 'outExpo',
    stagger: 170, staggerFrom: 'start',
    opacity: [0, 1], y: [26, 0]
  });
  for (var i = 0; i < 5; i++) {
    s1.cue('pop', 500 + i * 170, { gain: 0.5 + i * 0.06, pitch: 1 + i * 0.04 });
  }

  /* The headline lands after the last row has settled — it names what the
     viewer has already noticed. Compound move: opacity finishes before the
     position does, so it is readable while still arriving. */
  var lastRow = 500 + 4 * 170 + 620;
  s1.add('[data-el="hook-line"]', { at: lastRow + 260, dur: 700,  ease: 'outQuart', opacity: [0, 1] });
  s1.add('[data-el="hook-line"]', { at: lastRow + 260, dur: 1000, ease: 'softLand', y: [30, 0] });
  s1.cue('thump', lastRow + 300, { gain: 0.5 });
  /* Then hold. The remaining ~1.4s of stillness is doing work. */

  /* ==========================================================================
     S2 — REVEAL. Hard cut: the problem stops, something else is here.
     ========================================================================== */
  var s2 = tl.scene('reveal', SCENES.reveal[0], SCENES.reveal[1], CUT);

  s2.set('[data-el="hero-glass"]', { opacity: 0 });
  s2.set('[data-el="lock"]', { opacity: 0, y: 20 });
  s2.set('[data-el="tag"]',  { opacity: 0, y: 16 });
  s2.set('[data-el="sheen"]', { x: -420 });

  /* THE SPLIT — transform on the wrapper, opacity on the glass element.
     Fading the wrapper makes it a backdrop root and the glass silently goes
     flat. This is the single most common way to break Liquid Glass. */
  s2.add('[data-el="hero-wrap"]',  { at: 0, dur: 1100, ease: 'softLand', scale: [0.94, 1], y: [26, 0] });
  s2.add('[data-el="hero-glass"]', { at: 0, dur: 620,  ease: 'outQuart', opacity: [0, 1] });
  s2.cue('whoosh', 0, { gain: 0.55 });
  s2.cue('chime', 240, { gain: 0.5 });

  /* Sheen sweeps ONCE. On a loop it reads as a loading skeleton. */
  s2.add('[data-el="sheen"]', { at: 320, dur: 1150, ease: 'inOutCubic', x: [-420, 1420] });

  /* Contents lag the panel by ~60ms — secondary motion, so the scene has depth
     instead of looking like a flat image being slid around. */
  s2.add('[data-el="lock"]', { at: 380, dur: 760, ease: 'outExpo', opacity: [0, 1], y: [20, 0] });
  s2.add('[data-el="tag"]',  { at: 560, dur: 720, ease: 'outQuart', opacity: [0, 1], y: [16, 0] });

  /* ==========================================================================
     CAMERA — a slow push toward the hero panel, held, then released.

     camTo() brings a stage point to the stage centre. The scale factor is in
     there on purpose: the engine writes `translate3d(...) scale(...)` and CSS
     applies the RIGHTMOST function first, so the point is scaled about the
     centre before it is translated. Without the multiply the target lands
     hundreds of px off at any zoom above ~1.5.

     Animate .camera and nothing else for frame moves. Transform on an ancestor
     is safe for Liquid Glass; opacity/filter/mask are not — so never fade this.

     This push is deliberately gentle (1.12x). Cursor-led zooms in a UI scene go
     harder, 1.6-2.2x. Either way one push per beat. */
  var CX = 960, CY = 540;
  function camTo(px, py, s) {
    return { x: s * (CX - px), y: s * (CY - py), scale: s };
  }
  var push = camTo(960, 470, 1.12);   /* hero panel sits slightly above centre */

  tl.add('[data-el="camera"]', {
    at: SCENES.reveal[0] - 240,       /* LEADS the reveal — anticipation, not lockstep */
    dur: 1500, ease: 'inOutCubic',
    x: [0, push.x], y: [0, push.y], scale: [1, push.scale]
  });
  /* Released so it is still moving through the cut into the end card. A camera
     that finishes its move and sits still for a second is the dead air that
     makes an explainer feel like a slideshow. */
  tl.add('[data-el="camera"]', {
    at: SCENES.end[0] - 700,
    dur: 1400, ease: 'inOutCubic',
    x: [push.x, 0], y: [push.y, 0], scale: [push.scale, 1]
  });

  /* ==========================================================================
     S3 — END CARD. One action, held long enough to act on.
     ========================================================================== */
  var s3 = tl.scene('end', SCENES.end[0], SCENES.end[1], CUT);

  s3.set('[data-el="end-lock"]', { opacity: 0, scale: 0.96 });
  s3.set('[data-el="end-cta"]',  { opacity: 0, y: 18 });

  s3.add('[data-el="end-lock"]', { at: 0, dur: 900, ease: 'outExpo', opacity: [0, 1], scale: [0.96, 1] });
  s3.add('[data-el="end-cta"]',  { at: 420, dur: 700, ease: 'outQuart', opacity: [0, 1], y: [18, 0] });
  s3.cue('success', 60, { gain: 0.6 });
  /* ~2.1s of hold. Long enough to read the URL and decide. */

  /* ==========================================================================
     CURSOR — aim at the ELEMENT, never at hand-computed numbers.

     cursorTo() reads the target's LAYOUT position (an offsetParent walk), so it
     stays correct when the button moves and it is immune to both the stage fit
     scale and the camera transform. Hand-derived coordinates are correct exactly
     once; the next layout nudge silently puts every click a few px off.

     It plays the whole gesture — bowed travel, settle, press, release, ring —
     and returns the timing marks so the UI's reaction hangs off the click
     instead of a guessed number.
     ========================================================================== */
  var cta = tl.cursorTo('[data-el="end-cta"] .btn-primary', {
    at: SCENES.end[0] + 900,      /* after the CTA has finished arriving */
    from: { x: 1180, y: 250 }     /* first move needs a start; later ones chain */
  });

  tl.cue('click', cta.pressAt, { gain: 0.9 });
  /* The button reacts to the press, then recovers. */
  tl.add('[data-el="end-cta"] .btn-primary', {
    at: cta.pressAt, dur: 110, ease: 'outCubic', scale: [1, 0.96]
  });
  tl.add('[data-el="end-cta"] .btn-primary', {
    at: cta.releaseAt, dur: 320, ease: 'outBack', scale: [0.96, 1]
  });

  /* ==========================================================================
     AMBIENT — must be a function of t, never a CSS animation. A CSS keyframe
     animation freezes during frame-by-frame export because the browser clock
     does not advance between seeks.
     ========================================================================== */
  var auroras = document.querySelectorAll('[data-el="aurora"], [data-el="end-aurora"]');
  tl.loop(function (t) {
    for (var j = 0; j < auroras.length; j++) {
      var dx = Math.sin(t / 4200 + j) * 16;
      var dy = Math.cos(t / 5600 + j) * 11;
      auroras[j].style.transform =
        'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(1.06)';
    }
  });

  /* NO explicit pad cue here. SFX schedules an ambient bed automatically
     (SFX.bedGain, default 1) — a slow chord progression across the whole
     duration. Adding your own full-length `pad` on top stacks a second drone in
     the same octave and the low end turns to mud. Adjust the bed instead:
       SFX.bedGain = 0.6;   // quieter
       SFX.bedGain = 0;     // off, then place pads by hand
     Short pads for a single scene are still fine — it is the full-length one
     that collides. */

  tl.mount();
}());
```
