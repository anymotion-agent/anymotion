---
name: motion-graphics
description: Core motion graphics knowledge — timing, easing, choreography, continuity, camera, type in motion, sound sync, accessibility and performance. Use when animating anything (UI, web, explainer, title sequence, logo, chart) or when judging why an animation feels wrong.
---

# Motion Graphics

Everything below is craft that transfers across tools — After Effects, CSS,
Canvas, WebGL, Rive, Lottie. Read the section you need; the numbers are
conventions with reasons attached, not arbitrary.

If you are building a SaaS product explainer specifically, use the
`saas-explainer-motion` skill instead — it carries this knowledge plus a full
engine and component library.

## The one idea underneath all of it

**Motion is not decoration, it is grammar.** Every animated frame answers three
questions the viewer is asking without knowing it: *what changed*, *where did it
come from*, and *how do I feel about it*. Position and opacity answer the first
two. **Timing answers the third**, and timing is where amateur work fails.

A card that scales up in 120ms with a sharp stop reads as *snappy, mechanical,
confident*. The same card over 600ms with a soft landing reads as *heavy,
premium, deliberate*. Identical geometry. Different meaning. So the question is
never "should this animate" but "what should this motion say".

The corollary: **if a motion says nothing, cut it.** Animation that only exists
to prove the developer can animate adds latency and cognitive load. The default
answer to "should this move" is no; earn the yes.

## Timing

Duration is the single highest-leverage variable. Get it wrong and no amount of
easing rescues the shot.

| Motion | Duration | Why |
|---|---|---|
| Hover, focus, toggle | 80–150ms | Must feel instant. Above ~200ms it feels laggy. |
| Small entrance (icon, chip, tooltip) | 150–250ms | Short travel needs short time. |
| Card / panel / modal entrance | 250–400ms | Enough to read the direction it came from. |
| Full-screen or page transition | 400–700ms | Large travel, needs time or it strobes. |
| Camera move in a film | 800–2000ms | Deliberate, cinematic; the viewer is a passenger. |
| Exit | 60–80% of its entrance | Leaving is less informative than arriving. |

Two rules that do most of the work:

**Distance governs duration.** A 40px nudge and a 900px sweep cannot share a
duration. Big travel over a short time strobes; small travel over a long time
crawls. Duration should scale *sublinearly* with distance — roughly with its
square root, because perceived speed is not linear. Doubling the distance means
roughly 1.4× the time, not 2×.

**Exits are faster than entrances.** An entrance is teaching the viewer where
something lives; an exit is only confirming it is gone. Matching them makes
dismissals feel sticky.

Below ~100ms motion stops being perceived as motion and becomes a jump cut —
useful when you *want* instant, wasted when you wanted flow. Above ~1s in
interactive contexts the user has moved on and your animation is now in the way.

## Easing

Easing is the *distribution* of that duration across the travel. Linear motion
looks dead because nothing in the physical world starts and stops instantly.

The four families and what they read as:

- **Ease-out** (fast start, soft landing). Decelerating, like something arriving
  under its own momentum. **Default for entrances and for anything responding to
  a user action** — the response begins immediately, which feels fast, then
  settles. `cubic-bezier(0.16, 1, 0.3, 1)` is a strong, opinionated ease-out.
- **Ease-in** (soft start, fast end). Accelerating away. **Exits only.** Never
  use it for an entrance — the slow start reads as unresponsive lag.
- **Ease-in-out** (soft both ends). For motion that starts and ends on screen:
  moves, resizes, camera pans. `cubic-bezier(0.65, 0, 0.35, 1)`.
- **Spring / overshoot** (goes past, comes back). Adds physicality and
  playfulness. Overshoot 2–8% for premium restraint, 10%+ for character. Wrong
  for anything conveying precision — a data value that overshoots looks like it
  changed twice.

Spring physics is parameterised by stiffness and damping rather than a duration,
which is why spring-based motion feels alive and also why it's harder to
choreograph — you don't know exactly when it ends. Use springs for
interruptible, gesture-driven motion; use curves when you need to hit a beat.

**Opacity is the exception.** Fades read better close to linear; an eased fade
looks like it hesitates. Standard practice: ease position and scale, keep
opacity nearly linear, and let the fade finish *before* the movement so an
entering element is fully solid while it's still settling.

## The classical principles that still apply

Disney's twelve principles were written for character animation; roughly half
transfer directly to graphics and interfaces. The ones that matter:

**Squash and stretch** — deformation along the axis of travel sells weight and
speed. In graphics this is subtle: 2–5% scale on one axis during fast movement,
released on landing. Volume should look conserved; stretching without thinning
looks like a bug.

**Anticipation** — a small counter-move before the main move. A drawer that
pulls back 4px before sliding out. The eye needs a moment to know where to look,
and anticipation provides it. Overused, everything feels bouncy and slow.

**Follow-through and overlapping action** — parts don't stop simultaneously. A
card lands, its shadow settles a beat later, its text catches up last. This
single technique separates professional motion from flat motion more reliably
than any other.

**Slow in and slow out** — this is easing, above.

**Arcs** — natural movement curves. Straight-line travel reads as robotic, which
is exactly why a cursor moving in a straight line looks fake. Even a slight arc
on a long move transforms it.

**Secondary action** — a supporting motion that enriches without competing. A
button presses; the label dims fractionally. It must never pull focus.

**Staging** — direct attention to what matters. One idea per moment.

**Exaggeration** — push past literal reality. Real physics is often boring on
screen; the goal is *believable*, not accurate.

**Appeal** — the shot should be pleasant to look at. Not a technique, a
standard to hold yourself to.

## Choreography: what moves, and when

**One thing at a time.** The most common failure in amateur motion is
everything animating at once, so the eye has nowhere to land and the shot reads
as noise. Build a hierarchy: primary element moves, supporting elements follow,
background barely reacts.

**Stagger** is the workhorse. Animating list items with 30–60ms between each
turns a wall of simultaneous movement into a readable sweep. Under ~20ms it
looks simultaneous; over ~100ms per item the list feels slow and the last item
arrives after the viewer stopped caring. Cap total stagger around 300–400ms —
for a long list, stagger the first 6–8 items and land the rest together.

**Overlap, don't queue.** If element B starts only after A completely finishes,
the sequence feels like a to-do list. Start B when A is 60–80% done. Motion
should feel continuous, with energy passing between elements rather than
stopping and restarting.

**Direction carries meaning.** Movement should honour spatial logic: a panel
from the right returns to the right; a hierarchy expands downward; dismissal
moves away from the user's attention. Breaking your own spatial model quietly
disorients people.

## Continuity: the hardest part

Continuity is what makes a sequence feel like one film rather than a slideshow.

**Never let motion come to a dead stop before a change of scene.** If everything
eases to rest and *then* the scene cuts, the film flatlines for a beat. Overlap
the outgoing motion with the incoming one so energy carries across the boundary.

**Match cut / shared element.** The strongest transition available: carry one
element's geometry across the boundary so the viewer's eye tracks a single
object rather than re-acquiring a new scene. A card in scene one becomes the
panel header in scene two, arriving at the exact position it left. The discipline
is that the handoff pose must be written *once* and shared — if the outgoing and
incoming values are typed separately they drift, and the element jumps a few
pixels at the cut.

**Choosing a transition:**

| Transition | Reads as | Use |
|---|---|---|
| Hard cut | Instant, energetic | Default. Cuts are free; dissolves cost time. |
| Match cut | Same object, new context | The best moments in any explainer. |
| Cross-dissolve | Time passing, or a soft topic change | Sparingly — it can read as cheap. |
| Whip pan / swish | Fast lateral jump | Energetic pivots between unrelated ideas. |
| Wipe / mask reveal | Deliberate uncovering | Revealing a result or a comparison. |

**Change blindness** is the trap: a change made during a large motion or a cut
is often *not seen at all*. If something important changes, either change it on
a still frame, or draw the eye to it first.

## Camera

Treating the frame as a camera rather than a viewport unlocks the cinematic
register.

**Push in** (slow scale up) builds intensity and signals importance. **Pull out**
reveals context and releases tension — good for endings. **Pan** follows action.
**Parallax** (background layers moving slower than foreground) creates depth
cheaply and convincingly.

Camera moves should be **slow and few**. A push from 1.0 to 1.12 over 1500ms
reads as confident. The same push over 400ms reads as a zoom lens jerk. If the
camera moves in every shot, it stops meaning anything.

**Lead the subject.** Start the camera move 200–300ms *before* the thing it's
following, so the frame feels anticipatory rather than reactive.

One maths trap when implementing zoom-to-point with transforms: CSS applies
transform functions right-to-left, so with `translate(...) scale(s)` the
translation is in *unscaled* units and centring a point requires
`x = s * (centre − point)`. The naive `centre − point` leaves the target badly
off-frame at high scale.

## Type in motion

Text is read, not just seen, so it obeys different rules.

**Never animate individual letters of body copy.** Per-letter animation is for
short display text — a title, a word being emphasised. On a sentence it destroys
readability, because reading requires stable word shapes.

**Fade up plus a small rise** (8–24px, never more) is the reliable default for a
line of text. Large travel makes text unreadable in flight.

**Hold long enough to read.** Roughly 300ms of hold per short line minimum, and
in practice: read it aloud at a natural pace; if you can't finish, it's too
short. Text that leaves before it's read is worse than no text.

**Line-by-line beats word-by-word** for anything over a few words — stagger
lines by 60–120ms.

Avoid animating properties that trigger text re-layout mid-motion
(`font-size`, `letter-spacing`, `width`). Animate `transform` and `opacity`;
they don't reflow and don't resnap the glyphs.

**Numbers need tabular figures.** A counter animating from 0 to 1,284 will
jitter horribly as glyph widths change, unless you enable
`font-variant-numeric: tabular-nums`. This one line fixes the most common
"why does my counter wobble" complaint.

## Shape and colour

**Morph only when it is the same object in two states.** Play → pause, hamburger
→ X, card → panel. Morphing unrelated shapes (an envelope into a rocket) is a
party trick: the intermediate frames are meaningless because nothing is
half-envelope. Cross-fade unrelated things instead.

Every intermediate frame must read as a plausible silhouette — scrub to the
middle, because 0.5 progress is where morphs die.

Most convincing "morphs" are not path interpolation at all: rotating and
translating a few rectangles, a `clip-path` with matching vertex counts, or a
`border-radius` animation. Reach for real path interpolation last; it requires
both shapes to have corresponding commands and point counts, and libraries exist
(flubber, GSAP MorphSVG) precisely because that normalisation is hard.

**Colour** should transition through the right space. Interpolating between two
saturated colours in sRGB often passes through a muddy grey; OKLCH or LCH keeps
perceived lightness stable across the blend. Animate colour sparingly — it's a
strong signal, so reserve it for state change that matters.

**Light sells depth.** Flat fills look cheap. A small number of soft, large
gradients reading as light sources, plus shadows that actually correspond to
elevation, do more for perceived quality than any amount of extra movement.

## Sound

Sound is half of perceived production value, and cheap to get roughly right.

**Sync to the visual accent, not near it.** The human ear detects audio-visual
misalignment at roughly 20–40ms. A sound that lands even slightly after its
impact reads as broken. When in doubt, place the sound 1–2 frames *early*;
audio leading video is far less noticeable than audio lagging.

**Fewer, better cues.** One considered impact beats ten UI blips. Sound every
element and it becomes a slot machine.

**Design for silence first.** Most viewers watch muted, especially in-feed. If
the film only works with sound, it doesn't work. Sound should elevate, never
carry, the message.

Frequency has meaning: low frequencies read as weight and arrival, high
frequencies as precision and small detail. Match the sound to the size of the
thing moving.

## Performance

Smooth beats elaborate, always. A 24fps animation that stutters looks broken;
a simple one at a locked frame rate looks professional.

**Animate `transform` and `opacity`.** These are composited on the GPU and skip
layout and paint entirely. Animating `width`, `height`, `top`, `left`, or
`margin` forces layout on every frame — the single biggest cause of jank.

**Promote deliberately.** `will-change: transform` (or a 3D transform) lifts an
element to its own layer, but every layer costs memory. Promote what actually
moves, and remove the hint when the motion is done. Promoting everything is
slower than promoting nothing.

**Never read layout inside an animation frame.** Calling
`getBoundingClientRect` or `offsetHeight` after a write forces a synchronous
reflow — layout thrashing. Batch reads, then batch writes.

**Blur and shadow are expensive.** Large `filter: blur()`, `backdrop-filter`,
and big shadow spreads are per-pixel work every frame. Animating them is costly;
animating the *opacity* of a pre-blurred layer is cheap and usually
indistinguishable.

Budget: 16.7ms per frame at 60fps, and the browser needs part of that. If a
frame's JS exceeds ~8–10ms you will drop frames.

## Modern & Premium Animated Backgrounds

Backgrounds in high-end motion graphics are not static backdrops — they are ambient environments. A world-class background adds depth, mood, and cinematic texture without competing for attention with foreground elements.

### The 4 Pillars of Premium Background Design

1. **Subtlety & Contrast Hierarchy:**
   - Backgrounds live in low-contrast territory (10–25% opacity for decorative shapes, 0.05–0.15 for grids/particles).
   - Foreground cards and typography must maintain > 7:1 contrast against background ambient glow.

2. **Organic Fluid Motion (Liquid Mesh & Ambient Blobs):**
   - Use multi-layer CSS radial gradients + blur filters (`filter: blur(80px) saturate(180%)`) with smooth organic orbital motion.
   - Combine 2 to 4 color nodes moving at prime-number oscillation cycles (e.g. 11s, 17s, 23s) so the animation loop never feels repetitive.

3. **Tactile Grain & Noise Texturing:**
   - Pure digital gradients suffer from color banding on 8-bit displays.
   - Apply a subtle SVG noise overlay (`feTurbulence` with `mix-blend-mode: overlay` at 3–6% opacity) to give the background a tactile film-grain sheen.

4. **Deterministic Seeking Contract (`window.seek(t)`):**
   - Background motion MUST be driven deterministically by `t` in `window.seek(t)`.
   - Never rely on uncontrollable `setInterval` or free-running `requestAnimationFrame` for background elements; drive CSS custom properties or element transforms directly from `t`.

---

### Master Patterns for Modern Backgrounds

#### Pattern A: Liquid Mesh / Ambient Glow (Apple & Spotify Style)
- **Visual Feel:** Heavy, glassmorphic, ultra-premium dark ambient.
- **Color Palette:** Deep HSL base (`#030712`, `#070a13`) + 2 neon accent nodes (`hsl(265, 89%, 66%)`, `hsl(180, 100%, 50%)`).
- **Implementation:**
  ```css
  .bg-ambient {
    position: fixed; inset: 0; background: #070a13; overflow: hidden; z-index: -1;
  }
  .bg-glow-orb {
    position: absolute; border-radius: 50%; filter: blur(100px) saturate(180%);
    opacity: 0.35; mix-blend-mode: screen;
  }
  ```
- **Deterministic Motion in `window.seek(t)`:**
  ```javascript
  const orb1 = document.getElementById('orb1');
  const orb2 = document.getElementById('orb2');
  if (orb1 && orb2) {
    const x1 = Math.sin(t * 0.4) * 120;
    const y1 = Math.cos(t * 0.3) * 80;
    const x2 = Math.cos(t * 0.5) * 140;
    const y2 = Math.sin(t * 0.4) * 90;
    orb1.style.transform = `translate(${x1}px, ${y1}px) scale(${1 + Math.sin(t * 0.6) * 0.15})`;
    orb2.style.transform = `translate(${x2}px, ${y2}px) scale(${1 + Math.cos(t * 0.5) * 0.12})`;
  }
  ```

#### Pattern B: Perspective 3D Grid Sweep & Mesh Waveforms
- **Visual Feel:** Futuristic tech, developer tools, SaaS infrastructure.
- **Implementation:**
  - CSS Perspective plane: `transform: perspective(1000px) rotateX(60deg) translateY(-20%)`.
  - Grid background pattern using `repeating-linear-gradient` with animated SVG grid lines (`stroke-dashoffset`).
  - Synced pulse wave sweeping from top to bottom as key features are highlighted.

#### Pattern C: Floating Ambient Particles & Bokeh Flares
- **Visual Feel:** Atmospheric, cinematic, rich depth of field.
- **Implementation:**
  - 6 to 12 soft blurred floating bokeh nodes with variable depth scale (0.4x to 1.5x) and opacity pulsing (0.2 to 0.7).
  - Parallax movement: background particles move at 20% speed of foreground cards.

#### Pattern D: Tactile Film Grain & Noise Overlay (SVG Filter)
- **Implementation:**
  ```html
  <svg style="display:none">
    <filter id="noiseFilter">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </svg>
  <div style="position:fixed; inset:0; filter:url(#noiseFilter); opacity:0.04; mix-blend-mode:overlay; pointer-events:none; z-index:999"></div>
  ```

## Accessibility

**Honour `prefers-reduced-motion`.** This is not optional — vestibular disorders
make large-scale motion genuinely nauseating. The correct response is *not* to
remove all animation, which often breaks comprehension. Replace movement with
fades, kill parallax and large travel, and cut durations.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

That blunt reset is a floor, not a ceiling; a considered fade-only variant is
better.

The riskiest motion for vestibular triggers: large background movement,
parallax, spinning, and rapid zooms. Small opacity and colour changes are safe.

**Never flash more than three times per second** — that's the seizure threshold
in WCAG 2.3.1, and it is a hard rule, not a preference.

**Motion must not be the only signal.** If an animation communicates something
(an error, a state change), that meaning also needs a static form.

## Common failures

| Symptom | Cause |
|---|---|
| Feels sluggish despite short durations | Ease-in on entrances — the slow start reads as lag |
| Feels chaotic, eye doesn't know where to look | Everything animating simultaneously; no hierarchy, no stagger |
| Feels cheap / amateur | UI-speed timing on cinematic content; no overlap; no follow-through |
| Robotic | Linear easing, straight-line paths, everything stopping together |
| Counter or timer wobbles | Missing tabular figures |
| Janky, drops frames | Animating layout properties instead of transform/opacity |
| Text unreadable | Too much travel, per-letter animation on body copy, or too short a hold |
| Sequence feels like a slideshow | Motion stops dead before each transition |
| Element jumps at a shared-element transition | Handoff pose written twice and the copies drifted |
| Change goes unnoticed | Change blindness — it happened during a big move or a cut |

## A checklist before calling it done

1. Does each motion mean something? Delete the ones that don't.
2. Scrub to the midpoint of every transition. Does it read at 0.5?
3. Watch it muted. Does it still communicate?
4. Watch it at 2× speed and at 0.5×. Timing errors are obvious at the wrong
   speed.
5. Turn on reduced motion. Does it still work?
6. Check the frame rate on the weakest device you support, not the fastest.
7. Read every line of text aloud at a natural pace. Did you finish before it
   left?
