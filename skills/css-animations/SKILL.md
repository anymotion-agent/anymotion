---
name: css-animations
description: Practical CSS animation techniques — @keyframes, transitions, custom properties, performance, and when to reach for JavaScript instead. Use when implementing animations with pure CSS or debugging why a CSS animation looks wrong.
---

# CSS Animations

CSS animations are the fastest path to smooth motion on the web when the motion
fits what CSS can express. This covers what CSS does well, what it cannot do,
and how to keep it performing.

## When CSS is the right answer

- **Looping ambient motion** — breathing glows, floating elements, infinite
  spinners, and modern liquid/mesh animated backgrounds. CSS loops cost nothing; JS loops need `requestAnimationFrame`.
- **State-driven transitions** — hover, focus, checked, open. CSS sees the state
  change and runs the transition automatically.
- **Simple entrance/exit** — fade in, slide in, scale up. One `transition`
  declaration on the element, and every property change animates.
- **Performance-first motion** — CSS transitions on `transform` and `opacity`
  run on the compositor thread, bypassing layout and paint.

## When to use JavaScript instead

- **Sequenced choreography** — if element B must start when A is 70% done, CSS
  cannot coordinate that. Use a timeline library or manual RAF loop.
- **Dynamic easing** — spring physics, momentum scrolling, anything where the
  curve depends on user input. CSS easing is fixed at authoring time.
- **Seeking / scrubbing** — if the user drags a slider and the animation must
  jump to frame 47, CSS cannot do it. Animation state is read-only from JS.
- **Callbacks** — CSS fires `animationend` and `transitionend`, but if you need
  to know when an element is 50% through its travel, JS owns that.

## The two mechanisms

**`transition`** animates a property when it changes. You declare which
properties, how long, and what easing, and CSS does the rest whenever those
properties update — from a class toggle, a :hover, or JS assigning a value.

```css
.card {
  transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1),
              opacity 240ms linear;
}
.card:hover {
  transform: translateY(-4px);
  opacity: 0.92;
}
```

**`@keyframes` + `animation`** runs a named sequence, with as many intermediate
steps as you define. It can loop, reverse, and pause, but it starts on load or
class add and runs on its own clock. You cannot seek it from JS.

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.entering {
  animation: fadeInUp 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

## The performance contract

Animate **only `transform` and `opacity`** for 60fps.

- `transform: translate()` instead of `left` or `margin`
- `transform: scale()` instead of `width`/`height`
- `opacity` instead of `visibility: hidden` mid-transition

**Why:** `transform` and `opacity` are composited — the browser promotes the
element to its own layer and the GPU handles the animation. Changes to layout
properties (`width`, `top`, `margin`) force a reflow on every frame.

`will-change: transform` or a 3D transform like `translateZ(0)` forces layer
promotion. Use it deliberately: every layer costs memory, and too many layers
slow the compositor. Promote what actually animates, and remove the hint when
the animation is done.

```css
.card {
  /* Promote before animating */
  will-change: transform;
}
.card.settled {
  will-change: auto; /* Release the layer */
}
```

**Never animate these without measuring:**
- `filter`, `backdrop-filter` — per-pixel work every frame
- `box-shadow` with large blur — same cost
- `clip-path` with many points — geometry recalculation

Animating the *opacity* of a pre-blurred or pre-shadowed element is cheap and
usually looks identical.

## Easing

CSS easing is a cubic Bézier with four control points. The syntax is
`cubic-bezier(x1, y1, x2, y2)`, where (x1, y1) and (x2, y2) are the two inner
handles. Start and end are always (0,0) and (1,1).

| Name | Curve | Use |
|---|---|---|
| `ease-out` or `cubic-bezier(0.16, 1, 0.3, 1)` | Fast start, soft landing | Entrances, responses to user action |
| `ease-in` | Soft start, fast end | Exits only — slow start feels laggy on enter |
| `ease-in-out` or `cubic-bezier(0.65, 0, 0.35, 1)` | Soft both ends | Moves and resizes |
| `linear` | Constant speed | Fades, or when mimicking constant velocity (rare) |

The keywords `ease`, `ease-in`, `ease-out`, `ease-in-out` are shortcuts; the
explicit cubic-bezier form gives you exact control. For springs and overshoot,
CSS cannot do it natively — use a JS library or fake it with a multi-step
keyframe.

## Custom properties (CSS variables) as animation targets

You can animate a custom property and drive other values from it:

```css
@keyframes pulse {
  from { --scale: 1; }
  to { --scale: 1.08; }
}
.button {
  animation: pulse 1200ms ease-in-out infinite alternate;
  transform: scale(var(--scale));
}
```

This is surprisingly powerful: one animated `--progress` variable can drive
multiple derived values — positions, colours, opacities — with plain `calc()`.
The catch: only browsers from ~2022 onward animate custom properties smoothly;
older engines quantize them to integers.

## Timing functions are per-property

Each property in a `transition` list can have its own duration and easing:

```css
.card {
  transition: transform 400ms cubic-bezier(0.16, 1, 0.3, 1),
              opacity 200ms linear;
}
```

The transform takes 400ms with a strong ease-out; opacity finishes in 200ms,
nearly linear. This is how you make an element fully visible before it finishes
moving — a staple of polished entrances.

## `animation-fill-mode`

Controls what happens before and after the animation runs:

- `none` (default): element returns to its base style after the animation
- `forwards`: element holds the final keyframe after the animation ends
- `backwards`: element jumps to the first keyframe before the animation starts
  (useful with a delay)
- `both`: combines forwards and backwards

Most real usage: `forwards`, so the element stays where the animation left it.

```css
.toast {
  animation: slideIn 300ms ease-out forwards;
}
```

Without `forwards`, the toast would snap back to its starting position the
moment the 300ms finishes.

## Debugging

**Slow it down.** Scale all durations by 10× and watch in slow motion — timing
errors, easing mistakes, and hidden mid-flight jank become obvious.

```css
* {
  animation-duration: 10s !important;
  transition-duration: 10s !important;
}
```

**DevTools timeline.** Most browsers' performance panels show layer compositing
and paint. A green bar is composited (cheap); purple is paint (expensive).

**Check the computed style mid-transition.** `getComputedStyle(el).transform`
during a transform animation returns the interpolated matrix, which tells you
where the element actually is when it looks wrong.

## Accessibility: `prefers-reduced-motion`

Never ignore this — vestibular disorders make large motion nauseating. The
correct response is to replace movement with fades and cut durations, not to
remove all animation (which often breaks comprehension).

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

That blunt reset is a floor; a considered fade-only alternative is better.

## Common mistakes

| Symptom | Cause |
|---|---|
| Transition happens once, then never again | The property isn't actually changing — check with DevTools |
| Element jumps at the start of the animation | Missing `animation-fill-mode: backwards` |
| Animation stutters | Animating layout properties; switch to `transform` |
| Transition applies to unwanted properties | `transition: all` is too broad; list properties explicitly |
| Easing feels wrong | Using `ease-in` on an entrance (slow start = feels laggy) |
| Element disappears mid-transition | Parent has `overflow: hidden` and the element moves outside; add `overflow: visible` to the parent or rethink the motion |

## When to skip CSS and write JS

If the motion is essential to the experience — a product demo, a data
visualization, a game — and CSS cannot express what you need, don't try to hack
it into CSS. A clean JS implementation that works beats a CSS trick that almost
works.

The lines CSS cannot cross: seeking to an arbitrary frame, coordinating timing
across unrelated elements without a shared trigger, dynamic easing (springs,
momentum), and n-dimensional motion (a particle system, a physics sim).

For everything else, CSS is faster to write, faster to run, and requires no
library.

## Modern & Premium Animated Backgrounds in CSS

CSS is the ultimate engine for modern ambient backgrounds (mesh gradients, glowing orbs, 3D perspective grids, SVG grain noise).

### Liquid Mesh / Ambient Glow (CSS Radial Gradients + Blur)

```css
.bg-ambient {
  position: fixed; inset: 0; background: #070a13; overflow: hidden; z-index: -1;
}
.bg-orb {
  position: absolute; border-radius: 50%; filter: blur(100px) saturate(180%);
  opacity: 0.35; mix-blend-mode: screen;
  animation: orbFloat 18s ease-in-out infinite alternate;
}
@keyframes orbFloat {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(120px, -80px) scale(1.15); }
  100% { transform: translate(-90px, 100px) scale(0.95); }
}
```

### Film Grain & SVG Noise Overlay

```html
<svg style="display:none">
  <filter id="noiseFilter">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
</svg>
<div style="position:fixed; inset:0; filter:url(#noiseFilter); opacity:0.04; mix-blend-mode:overlay; pointer-events:none; z-index:999"></div>
```