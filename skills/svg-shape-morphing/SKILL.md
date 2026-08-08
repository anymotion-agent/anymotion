---
name: svg-shape-morphing
description: Practical SVG path morphing — when to morph, why naive d interpolation fails, normalizing paths, libraries (flubber, GSAP MorphSVG), and transform-based alternatives. Use when building icon transitions or shape animations.
---

# SVG Shape Morphing

Path morphing is one shape becoming another as a continuous body — a play
triangle folding into pause bars, a hamburger straightening into an X, a card
expanding into a panel. Done well it is the strongest continuity device
available; done badly it is a lurching blob.

This covers when to morph at all, why it is hard, and the three ways to solve
it.

## When to morph

**The rule:** morph when the two shapes are *the same thing in two states*. Play
→ pause is the same control. A chevron flipping is the same affordance. An
envelope becoming a sent icon is the same message object.

Do **not** morph between unrelated objects. A star becoming a heart is a party
trick — the intermediate frames are meaningless because nothing is half-star,
and the viewer spends the whole beat decoding the blob instead of listening.
Cross-fade unrelated things, or cut.

**Every intermediate frame must read as a plausible silhouette.** Scrub to
t=0.5 and look at it. If that frame is an ambiguous lump, the morph reads as a
rendering glitch even though the endpoints are perfect.

## Why naive interpolation fails

You cannot blend two `d` strings by blending their text. Three separate
problems compound:

**1. Mismatched command counts.** One path has 4 commands, the other has 11.
There is no pairwise correspondence, so there is nothing to interpolate.

**2. Mismatched command types.** `L` (line, 2 numbers) and `C` (cubic Bézier, 6
numbers) do not even have the same arity. Blending `L10 0` with `C1 1 2 2 3 3`
is not a shape.

**3. Start point and winding direction.** Even with matched counts and types,
if the two paths begin at different vertices the morph includes a spurious
rotation as the start point travels around the perimeter. And if one path winds
clockwise while the other winds counter-clockwise, the shape turns **inside
out** halfway through.

The standard fix in every real morphing library: **convert every command to a
cubic Bézier** (`C`). A cubic can express a line by putting its control points
on the line, and can approximate an arc in a few segments, so once everything
is cubic the arities match by construction. Then test rotation offsets and pick
the one that minimizes total point travel.

## The three ways to morph

### 1. Transform-based (cheapest, often sufficient)

Most shipped icon morphs are not path interpolation at all.

- **Hamburger → X:** three `<rect>` elements, rotate the top and bottom by ±45°,
  fade the middle one.
- **Chevron flip:** `rotate(180deg)`.
- **Plus → check:** two strokes rotating and translating.

These are cheap, GPU-friendly, never produce an ambiguous silhouette, and
compose with CSS transitions or any JS library. Reach here first.

### 2. Use a normalization library

When you need real path morphing, vendor a library that does the normalization.

**flubber** (small, zero dependencies, MIT):

```js
import { interpolate } from 'flubber';

const pathA = 'M0 0 L100 0 L100 100 L0 100 Z';
const pathB = 'M50 0 L100 50 L50 100 L0 50 Z';

const interpolator = interpolate(pathA, pathB, { maxSegmentLength: 10 });

// Returns a function: t => pathString
animationLoop(t => {
  path.setAttribute('d', interpolator(t));
});
```

`maxSegmentLength` subdivides long segments into shorter ones for smoother
interpolation. The returned function is a pure function of `t`, so it works
with any timing system — CSS, GSAP, a manual RAF loop, or a scrubbing slider.

**GSAP MorphSVG** (commercial, the most polished):

```js
gsap.to(path, {
  duration: 0.6,
  morphSVG: { shape: targetPath, shapeIndex: 'auto' },
  ease: 'power2.inOut',
});
```

`shapeIndex` is the rotation offset; `'auto'` searches for the best one.
MorphSVG handles winding direction, start-point alignment, and preserves curve
quality better than any other implementation. The catch: it is part of GSAP's
paid Club plugins.

**polymorph / d3-interpolate-path** (MIT, lighter than flubber):

Similar API to flubber, slightly different normalization heuristics. Both work;
pick based on which one handles your specific shapes better.

### 3. Manual correspondence (for simple cases)

If both shapes are geometric and you control the authoring, draw them with
matching structure — same command count, same command types, same start point.

```js
// A square and a diamond, both 5 points (doubled corner for count match)
const square = 'M0 0 L100 0 L100 100 L0 100 L0 0 Z';
const diamond = 'M50 0 L100 50 L50 100 L0 50 L50 0 Z';
```

Then interpolate the coordinates directly:

```js
function interpolatePath(a, b, t) {
  const numsA = a.match(/-?\d+\.?\d*/g).map(Number);
  const numsB = b.match(/-?\d+\.?\d*/g).map(Number);
  const commands = a.replace(/-?\d+\.?\d*/g, '').split('');

  let result = '';
  for (let i = 0; i < numsA.length; i++) {
    const v = numsA[i] + (numsB[i] - numsA[i]) * t;
    result += commands[i] + v + ' ';
  }
  return result.trim();
}
```

This only works when the two paths already correspond. The moment they
diverge — different command counts, different types — it breaks.

**Degenerate points** let you pad a simpler shape to match a complex one:
repeat a coordinate so it contributes to the count while occupying no visible
length. A play triangle authored as `M10 5 L30 15 L10 25 L10 25 Z` (the last
vertex doubled) has the same structure as two pause bars with 4 corners each.

## Choosing between the three

| Approach | When |
|---|---|
| Transform (rotate, translate, scale) | Default for icon transitions — hamburger, chevron, plus/check |
| `clip-path: polygon()` with matching vertex counts | Geometric UI transitions, shearing rectangles into trapezoids |
| `border-radius` | Rounding a square into a circle |
| Library (flubber, MorphSVG) | Organic shapes, logos, illustrations where transform is insufficient |
| Manual correspondence | You control authoring and the shapes are simple enough to hand-match |

Transform beats path interpolation whenever it is sufficient — it is cheaper,
more reliable, and easier to reverse or interrupt.

## Common mistakes

| Symptom | Cause |
|---|---|
| Shape snaps at the midpoint instead of morphing | Interpolating mismatched structures, or the library returned null and you fell back to a ternary |
| Blob looks nothing like either endpoint | Mismatched winding direction or start-point offset |
| Morph starts smooth then collapses into chaos | Command types differ (e.g. `L` against `C`) and the library's fallback kicked in |
| Element jumps a few pixels during the morph | Parent has `overflow: hidden` clipping the transform, or the two paths are defined in different coordinate spaces |

## CSS `transition` on `d` is not scrubbable

Modern browsers support animating the `d` attribute directly with CSS
transitions:

```css
path {
  d: path('M0 0 L100 0 L100 100 L0 100 Z');
  transition: d 400ms ease-in-out;
}
path:hover {
  d: path('M50 0 L100 50 L50 100 L0 50 Z');
}
```

This works for hover and state-driven transitions, but you cannot seek it from
JavaScript — the animation runs on the browser's clock and `getComputedStyle`
returns only the start or end, never the interpolated value. If you need
frame-by-frame control or scrubbing, use flubber or GSAP.

## Performance

Recomputing a path every frame is main-thread work. `will-change` does not help
because path geometry is not compositable. Keep morphing paths under roughly 50
points and the cost is negligible. A few hundred points is worth measuring, and
the right fix is usually simplifying the shape rather than optimizing the
interpolation.

## Accessibility

Morphs read better than cross-fades to sighted users, but make no difference to
screen readers. If the morph communicates a state change (play → pause), that
state must also be announced with `aria-label` or `aria-live`.

For `prefers-reduced-motion`, replace the morph with an instant swap or a short
cross-fade — the semantic outcome is identical.

## When not to morph at all

If the intermediate frames would be ambiguous or if the two shapes are
semantically unrelated, a cross-fade with a slight scale (0.96 → 1.0) reads as
a transformation without requiring the viewer to decode a blob. At 200–300ms
the eye cannot tell you did not morph, and it never produces a bad in-between.

Morphing is expensive in authoring time — matching structures, tuning
parameters, testing the midpoint — so the question is always whether the
result justifies the cost. For an icon used fifty times per session, yes. For a
decorative flourish in a hero section, probably not.