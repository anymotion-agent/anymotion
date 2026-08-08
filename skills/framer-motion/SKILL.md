---
name: framer-motion
description: Framer Motion usage patterns — declarative React animation, gesture handling, layout animations, variants, orchestration, and AnimatePresence. Use when animating a React app or when CSS and vanilla JS are too cumbersome.
---

# Framer Motion

Framer Motion is the declarative animation library for React. It wraps the Web
Animations API and FLIP technique into components you compose like any other
React UI, and it handles interruption, layout animations, and gesture-driven
motion better than hand-rolled solutions.

Use it when CSS transitions are too limited and writing RAF loops by hand is
too much boilerplate. Do not use it when you are not in React, or when the
motion is simple enough for plain CSS.

## The core idea

Instead of imperatively calling `.animate()` or managing state timers, you
declare what the component should look like in each state and Framer Motion
interpolates between them.

```jsx
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
>
  Content
</motion.div>
```

When `animate` changes, the component animates to the new values. When the
component unmounts, wrap it in `<AnimatePresence>` and add an `exit` prop to
animate it out.

## When Framer Motion is the right tool

- **React projects with non-trivial animation.** If you are toggling classes or
  writing `useEffect` hooks that tween values manually, Framer Motion is
  cleaner.
- **Gesture-driven UI.** Drag, pan, swipe — these are built-in and interruption
  is handled automatically.
- **Layout animations.** When an element's size or position changes due to a
  layout shift (reorder, filtering a list), `layout` prop applies FLIP under
  the hood.
- **Orchestrated sequences.** `variants` let you define named animation states
  and propagate them to children, with per-child delays or stagger.

## When to skip it

- **Simple hover/focus transitions.** CSS `:hover` and `transition` are faster
  to write and faster to run.
- **Outside React.** Framer Motion is React-only; use GSAP, Anime.js, or Motion
  One for other frameworks.
- **Bundle size matters and motion is minimal.** Framer Motion adds ~40KB
  minified; if you only fade in two elements, CSS is free.

## Motion components

Any HTML or SVG element can become a motion component by prefixing `motion.`:

```jsx
<motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
  Press me
</motion.button>
```

For custom components, wrap them:

```jsx
const MotionCard = motion(Card);
```

The component must forward `ref` — `motion()` needs it to measure layout.

## Animation props

| Prop | Runs when |
|---|---|
| `initial` | Component mounts — starting values |
| `animate` | Whenever this object changes — target values |
| `exit` | Component unmounts (requires `<AnimatePresence>`) |
| `whileHover` | Pointer enters |
| `whileTap` | Pointer presses |
| `whileFocus` | Element focuses |
| `whileInView` | Element scrolls into viewport |

`initial={false}` disables the mount animation, useful when server-rendering or
when you want elements to appear instantly.

## Transitions

The `transition` prop controls timing and easing:

```jsx
<motion.div
  animate={{ x: 100 }}
  transition={{
    duration: 0.6,
    ease: [0.16, 1, 0.3, 1],  // cubic-bezier
    delay: 0.1,
  }}
/>
```

**Spring physics** (the default for most properties):

```jsx
transition={{ type: 'spring', stiffness: 300, damping: 20 }}
```

Springs feel alive but their duration is not fixed — they end when velocity
drops below a threshold. For choreographed sequences where you need to hit a
beat, use `type: 'tween'` with an explicit duration.

**Per-property timing:**

```jsx
transition={{
  x: { duration: 0.4, ease: 'easeOut' },
  opacity: { duration: 0.2 },
}}
```

Useful when you want position to move smoothly while opacity snaps.

## Variants: orchestration and propagation

Variants are named animation states. Define them once, reference them by name,
and they propagate to children automatically.

```jsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

<motion.ul variants={container} initial="hidden" animate="show">
  <motion.li variants={item}>One</motion.li>
  <motion.li variants={item}>Two</motion.li>
  <motion.li variants={item}>Three</motion.li>
</motion.ul>
```

When the parent enters the `show` state, each child animates to its own `show`
state with a 100ms stagger. This is far cleaner than manually calculating delays.

**delayChildren** starts the whole stagger after a delay.
**staggerDirection** reverses stagger order (`1` for forward, `-1` for reverse).

## Layout animations

When a component's layout changes (position, size), adding `layout` applies
FLIP automatically — the element is measured before and after, then animated
from the old position to the new one.

```jsx
<motion.div layout>
  {isOpen ? <ExpandedContent /> : <CollapsedContent />}
</motion.div>
```

The transition happens even though the DOM structure changed, because Framer
Motion measures the old and new boxes and transforms between them.

**Shared layout animations** let two different components animate as if they
are the same element:

```jsx
{isDetail ? (
  <motion.div layoutId="card-123">Detail view</motion.div>
) : (
  <motion.div layoutId="card-123">Thumbnail</motion.div>
)}
```

The `layoutId` tells Motion these are two views of one logical element, so it
morphs between them. This is how you build the iOS photos grid-to-detail
transition.

**Cost:** Layout animations read `getBoundingClientRect` and force a reflow, so
they are more expensive than transform-only animations. Fine for user-triggered
actions, risky for continuous scroll effects.

## AnimatePresence: exit animations

React removes unmounted components immediately; `<AnimatePresence>` delays
unmount until the `exit` animation finishes.

```jsx
<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      Content
    </motion.div>
  )}
</AnimatePresence>
```

Wrap the parent that conditionally renders children, not each child.

For lists, give each item a unique `key` and set `mode="wait"` to wait for the
exiting element before mounting the next:

```jsx
<AnimatePresence mode="wait">
  <motion.div key={currentPage} exit={{ opacity: 0 }}>
    {pages[currentPage]}
  </motion.div>
</AnimatePresence>
```

Without `mode="wait"`, both pages overlap during the transition.

## Gestures: drag, pan, hover, tap

**Drag:**

```jsx
<motion.div drag dragConstraints={{ left: -100, right: 100, top: 0, bottom: 0 }}>
  Drag me
</motion.div>
```

`drag="x"` or `drag="y"` locks to one axis. `dragElastic` adds rubber-banding.

**dragConstraints** can also be a ref to a parent element, and Motion will
calculate the bounds automatically.

**Drag events:**

```jsx
<motion.div
  drag
  onDragStart={(event, info) => console.log('Started')}
  onDrag={(event, info) => console.log(info.point)}
  onDragEnd={(event, info) => console.log('Released')}
/>
```

`info` includes `point`, `offset`, `velocity`.

**Pan** (drag without moving the element) is useful for custom scroll or swipe:

```jsx
<motion.div
  onPan={(event, info) => console.log(info.offset)}
  onPanEnd={(event, info) => {
    if (info.offset.x < -100) nextSlide();
  }}
/>
```

## Scroll-triggered animations: `whileInView`

```jsx
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.5 }}
>
  Animates when 50% is in view
</motion.div>
```

`once: true` means it only animates the first time. `amount: 0.5` sets the
threshold.

## useMotionValue and useTransform: manual control

Sometimes you need direct access to an animated value — for example, to drive
multiple properties from one gesture.

```jsx
import { motion, useMotionValue, useTransform } from 'framer-motion';

const x = useMotionValue(0);
const opacity = useTransform(x, [-100, 0, 100], [0, 1, 0]);

<motion.div drag="x" style={{ x, opacity }}>
  Drag me
</motion.div>
```

`useTransform` maps one range to another. As `x` moves from -100 to 0, opacity
goes from 0 to 1; from 0 to 100, opacity returns to 0.

**useScroll** tracks scroll position:

```jsx
const { scrollYProgress } = useScroll();
const scale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);
```

`scrollYProgress` is 0 at the top, 1 at the bottom. This is how you build
parallax and scroll-driven scale effects.

## Performance

Motion runs animations on the main thread by default, which means layout,
paint, and JS all compete. Animating `x`, `y`, `scale`, `rotate`, and `opacity`
is composited and cheap; animating `width`, `height`, `top`, or `left` forces
layout every frame.

`layout` animations are inherently expensive — they measure boxes and apply
FLIP — so reserve them for user-triggered interactions, not continuous scroll.

`will-change` is applied automatically when an animation starts and removed when
it ends, so you do not manage it manually.

## Reduced motion

Framer Motion respects `prefers-reduced-motion` if you tell it to:

```jsx
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4 }}
/>
```

Or globally:

```jsx
import { MotionConfig } from 'framer-motion';

<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

`"user"` honours the user's system preference; `"always"` disables all motion.

## Common mistakes

| Symptom | Cause |
|---|---|
| Exit animation does not run | Missing `<AnimatePresence>` or child has no `key` |
| Layout animation jumps | Parent or child has `overflow: hidden` clipping the transform |
| Animation stutters | Animating `width`/`height` instead of `scale`, or animating too many elements with layout |
| Drag feels sluggish | `dragElastic` is too high, or you are running heavy logic in `onDrag` |
| Variant does not propagate | Child is not a `motion` component, or it has its own `animate` prop overriding the parent |
| Spring never settles | Stiffness or damping is misconfigured; try `type: 'tween'` instead |

## When to use imperative controls

Most of the time declarative props are cleaner, but `useAnimation` gives you
manual control:

```jsx
import { motion, useAnimation } from 'framer-motion';

const controls = useAnimation();

<motion.div animate={controls} />

// Later:
controls.start({ x: 100 });
```

Reach for this when animation logic is tied to external events — WebSocket
messages, intersection observers you built yourself, game loops.

## Where Framer Motion shines

- Prototyping interaction quickly — drag, spring physics, and gesture handling
  are built-in, so you do not rewrite them every project.
- Layout animations and shared-element transitions, which are painful to hand-roll.
- Scroll-driven effects that need to interpolate values smoothly.
- Staggered lists and orchestrated sequences without manually computing delays.

Where it does not: ultra-high-performance particle systems, anything that needs
deterministic frame-by-frame control for export, and simple CSS-level transitions
that do not justify the bundle weight.