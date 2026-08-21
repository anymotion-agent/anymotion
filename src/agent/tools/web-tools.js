/**
 * WEB TOOLS — research, brand extraction, and asset download.
 *
 * The old engine scraped a URL exactly once, automatically, on the first user message
 * (ai-engine.js enrichPromptWithUrlContext). That is the wrong shape: the model could
 * not go back for a second page, could not follow a link it found, and could not
 * search for something it did not already have a URL for. These are tools instead, so
 * research becomes a loop the model drives.
 *
 * extractBrand() is also exported for the legacy enrich path, which is where the
 * `fonts` ReferenceError lived — the variable was read but never assigned, so every
 * scrape died in its own catch block and the feature silently did nothing.
 */

import fs from 'fs';
import path from 'path';
import { assertWritable, ensureDir } from '../sandbox.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT = 15_000;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

function decodeEntities(text) {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * How many colours an extraction reports.
 *
 * A brand owns two or three colours. The scrape used to report the top 14 values by
 * frequency and label them "the palette", which is where plans with seven brand colours
 * came from — five of them greys the site uses for borders and body type.
 */
const MAX_BRAND_COLORS = 5;
const MAX_NEUTRALS = 2;

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp >= 1 && hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp >= 2 && hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp >= 3 && hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp >= 4 && hp < 5) [r1, g1, b1] = [x, 0, c];
  else if (hp >= 5 && hp < 6) [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.min(255, Math.max(0, Math.round((r1 + m) * 255))),
    g: Math.min(255, Math.max(0, Math.round((g1 + m) * 255))),
    b: Math.min(255, Math.max(0, Math.round((b1 + m) * 255)))
  };
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()` → `{r,g,b}`. Null when unreadable. */
function parseColor(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let full = hex[1];
    if (full.length === 3) full = full.split('').map(ch => ch + ch).join('');
    if (full.length === 8) {
      const alpha = parseInt(full.slice(6, 8), 16) / 255;
      if (alpha < 0.15) return null;
      full = full.slice(0, 6);
    }
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16)
    };
  }

  const fn = v.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    if (parts.length > 3) {
      const a = parts[3].includes('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      if (Number.isFinite(a) && a < 0.15) return null;
    }
    const clamp = n => Math.min(255, Math.max(0, Math.round(n)));
    return { r: clamp(r), g: clamp(g), b: clamp(b) };
  }

  const hsl = v.match(/^hsla?\(([^)]+)\)$/);
  if (hsl) {
    const parts = hsl[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / (parts[1].includes('%') ? 100 : (parseFloat(parts[1]) > 1 ? 100 : 1));
      const l = parseFloat(parts[2]) / (parts[2].includes('%') ? 100 : (parseFloat(parts[2]) > 1 ? 100 : 1));
      if (Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l)) {
        if (parts.length > 3) {
          const a = parts[3].includes('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
          if (Number.isFinite(a) && a < 0.15) return null;
        }
        return hslToRgb(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)));
      }
    }
  }

  return null;
}

function toHex({ r, g, b }) {
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

/** Hue in degrees, saturation and lightness on 0-1. Used only to sort brand from surface. */
function toHsl({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

const TAILWIND_COLORS = {
  'black': '#000000', 'white': '#ffffff',
  'gray-50': '#f9fafb', 'gray-100': '#f3f4f6', 'gray-200': '#e5e7eb', 'gray-300': '#d1d5db', 'gray-400': '#9ca3af', 'gray-500': '#6b7280', 'gray-600': '#4b5563', 'gray-700': '#374151', 'gray-800': '#1f2937', 'gray-900': '#111827', 'gray-950': '#030712',
  'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5', 'zinc-200': '#e4e4e7', 'zinc-300': '#d4d4d8', 'zinc-400': '#a1a1aa', 'zinc-500': '#71717a', 'zinc-600': '#52525b', 'zinc-700': '#3f3f46', 'zinc-800': '#27272a', 'zinc-900': '#18181b', 'zinc-950': '#09090b',
  'neutral-50': '#fafafa', 'neutral-100': '#f5f5f5', 'neutral-200': '#e5e5e5', 'neutral-300': '#d4d4d4', 'neutral-400': '#a3a3a3', 'neutral-500': '#737373', 'neutral-600': '#525252', 'neutral-700': '#404040', 'neutral-800': '#262626', 'neutral-900': '#171717', 'neutral-950': '#0a0a0a',
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1', 'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569', 'slate-700': '#334155', 'slate-800': '#1e293b', 'slate-900': '#0f172a', 'slate-950': '#020617',
  'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8',
  'indigo-500': '#6366f1', 'indigo-600': '#4f46e5', 'indigo-700': '#4338ca',
  'violet-500': '#8b5cf6', 'violet-600': '#7c3aed', 'violet-700': '#6d28d9',
  'purple-500': '#a855f7', 'purple-600': '#9333ea', 'purple-700': '#7e22ce',
  'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857',
  'green-500': '#22c55e', 'green-600': '#16a34a', 'green-700': '#15803d',
  'cyan-400': '#22d3ee', 'cyan-500': '#06b6d4', 'cyan-600': '#0891b2',
  'teal-400': '#2dd4bf', 'teal-500': '#14b8a6', 'teal-600': '#0d9488',
  'amber-500': '#f59e0b', 'amber-600': '#d97706',
  'orange-500': '#f97316', 'orange-600': '#ea580c',
  'red-500': '#ef4444', 'red-600': '#dc2626'
};

/**
 * Robust extraction of the 3 to 5 real branding colors from a page,
 * prioritizing meta theme colors, CSS brand variables, Tailwind color tokens,
 * and filtering out 3rd-party customer logos from partner carousels.
 */
function extractPalette(html) {
  const entries = []; // array of { value, weight, source }

  // 1. High-priority: Meta theme-color & tile colors (Weight: 120)
  const metaThemeMatches = [
    ...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:theme-color|msapplication-TileColor|msapplication-navbutton-color)["'][^>]+content=["']([^"']+)["']/gi)
  ];
  for (const m of metaThemeMatches) {
    if (m[1]) entries.push({ value: m[1], weight: 120, source: 'meta' });
  }

  // 2. High-priority: CSS Brand Variables in :root or stylesheets (Weight: 80)
  const cssVarMatches = [
    ...html.matchAll(/--(?:primary|brand|accent|main|theme|color-primary|color-brand|color-accent|hero-color|highlight)[^:]*:\s*([^;}\n]+)/gi)
  ];
  for (const m of cssVarMatches) {
    if (m[1]) entries.push({ value: m[1].trim(), weight: 80, source: 'css-var' });
  }

  // Clean HTML to remove scripts, styles, syntax-highlighted code blocks, customer logo clouds, partner carousels & footer social links
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, '')
    .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, '')
    .replace(/<section[^>]*(?:trusted|partner|customer|logo|client|marquee|integrat)[^>]*>[\s\S]*?<\/section>/gi, '')
    .replace(/<div[^>]*(?:trusted|partner|customer|logo-cloud|client|marquee|integrat)[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

  // 3. Tailwind color utility classes in actual markup (Weight: 40)
  for (const [key, hex] of Object.entries(TAILWIND_COLORS)) {
    const regex = new RegExp(`\\b(?:bg|text|border|from|to|via)-${key}\\b`, 'g');
    const matches = cleanHtml.match(regex);
    if (matches && matches.length >= 2) {
      entries.push({ value: hex, weight: Math.min(100, matches.length * 8), source: 'tailwind' });
    }
  }

  // 4. Primary CTA buttons & Header elements (Weight: 30)
  const ctaMatches = [
    ...cleanHtml.matchAll(/(?:btn-primary|button-primary|cta|hero)[^>]*style=["'][^"']*(?:background|background-color|color):\s*([^;"]+)/gi)
  ];
  for (const m of ctaMatches) {
    if (m[1]) entries.push({ value: m[1].trim(), weight: 30, source: 'cta' });
  }

  // 5. SVG gradients, fills and strokes from content (Weight: 1)
  const svgMatches = [
    ...cleanHtml.matchAll(/(?:stop-color|fill|stroke)=["'](#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))["']/gi)
  ];
  for (const m of svgMatches) {
    if (m[1] && !/^(none|transparent|currentColor)$/i.test(m[1])) {
      entries.push({ value: m[1], weight: 1, source: 'svg' });
    }
  }

  // 6. Raw hex codes from markup (Weight: 3 for saturated chromatic, 1 for neutral)
  const rawHex = cleanHtml.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || [];
  for (const h of rawHex) {
    const parsed = parseColor(h);
    const weight = (parsed && toHsl(parsed).s >= 0.35) ? 3 : 1;
    entries.push({ value: h, weight, source: 'hex' });
  }

  const rawRgb = cleanHtml.match(/rgba?\([^)]{5,60}\)/g) || [];
  for (const r of rawRgb) entries.push({ value: r, weight: 1, source: 'rgb' });

  /** hex → { score, count, hsl, sources } */
  const seen = new Map();
  for (const { value, weight, source } of entries) {
    const parsed = parseColor(value);
    if (!parsed) continue;
    const hex = toHex(parsed);
    const hit = seen.get(hex);
    if (hit) {
      hit.score += weight;
      hit.count++;
      hit.sources.add(source);
    } else {
      seen.set(hex, { score: weight, count: 1, hsl: toHsl(parsed), sources: new Set([source]) });
    }
  }

  const chromatic = new Map();
  const monochrome = new Map();

  for (const [hex, { score, count, hsl, sources }] of seen) {
    const isNeutral = hsl.s < 0.16 || hsl.l > 0.90 || hsl.l < 0.15;
    const key = isNeutral
      ? `m:${Math.round(hsl.l * 8)}`
      : `c:${Math.round(hsl.h / 24)}:${Math.round(hsl.l * 5)}`;

    const targetMap = isNeutral ? monochrome : chromatic;
    const bucket = targetMap.get(key);
    if (!bucket) {
      targetMap.set(key, { score, count, best: { hex, score, count, hsl, sources } });
    } else {
      bucket.score += score;
      bucket.count += count;
      if (score > bucket.best.score) {
        bucket.best = { hex, score: bucket.score, count: bucket.count, hsl, sources };
      } else {
        bucket.best.score = bucket.score;
        bucket.best.count = bucket.count;
      }
    }
  }

  const rank = (map) => [...map.values()]
    .sort((a, b) => b.score - a.score)
    .map(b => b.best);

  const rankedChromatic = rank(chromatic);
  const rankedMonochrome = rank(monochrome);

  // Require chromatic colors to come from branding sources (Meta, CSS Var, CTA, SVG, Hex, Tailwind)
  const verifiedChromatic = rankedChromatic.filter(b => 
    b.sources.has('meta') || 
    b.sources.has('css-var') || 
    b.sources.has('cta') ||
    b.sources.has('svg') ||
    ((b.sources.has('hex') || b.sources.has('tailwind')) && (b.count >= 2 || b.score >= 5))
  );

  const chromaticPool = verifiedChromatic.length > 0 ? verifiedChromatic : rankedChromatic;

  const sortMonochromeLuxury = (monos) => {
    const hexes = monos.map(m => m.hex.toLowerCase());
    const darks = hexes.filter(h => {
      const p = parseColor(h);
      return p && toHsl(p).l <= 0.20;
    });
    const lights = hexes.filter(h => {
      const p = parseColor(h);
      return p && toHsl(p).l >= 0.82;
    });
    const mids = hexes.filter(h => !darks.includes(h) && !lights.includes(h));

    const result = [];
    if (darks.includes('#000000')) result.push('#000000');
    else if (darks.length) result.push(darks[0]);
    else result.push('#000000');

    if (lights.includes('#ffffff')) result.push('#ffffff');
    else if (lights.length) result.push(lights[0]);
    else result.push('#ffffff');

    darks.filter(d => !result.includes(d)).forEach(d => result.push(d));
    lights.filter(l => !result.includes(l)).forEach(l => result.push(l));
    mids.filter(m => !result.includes(m)).forEach(m => result.push(m));

    return result.slice(0, 5);
  };

  const sumScores = (map) => [...map.values()].reduce((acc, b) => acc + b.score, 0);
  const totalChromaticScore = sumScores(chromatic);
  const totalMonochromeScore = sumScores(monochrome);

  // If a site is 90%+ monochrome and has no chromatic accents anywhere, it is a Luxury Monochrome brand (ElevenLabs, Apple, Vercel)
  const isDominantMonochrome = chromaticPool.length === 0 || (totalChromaticScore < 0.10 * totalMonochromeScore && !chromaticPool.some(b => b.sources.has('meta') || b.sources.has('css-var') || b.sources.has('cta')));

  let finalColors = [];
  if (!isDominantMonochrome && chromaticPool.length >= 3) {
    // Multi-color brand (e.g. Supabase, Stripe, Imagine.art)
    finalColors = chromaticPool.slice(0, 5).map(b => b.hex);
  } else if (!isDominantMonochrome && chromaticPool.length > 0) {
    // Brand with 1 or 2 strong accents + signature dark/light neutrals
    const monoPicks = sortMonochromeLuxury(rankedMonochrome);
    finalColors = [
      ...chromaticPool.map(b => b.hex),
      ...monoPicks.slice(0, 5 - chromaticPool.length)
    ];
  } else {
    // Luxury monochrome brand (e.g. ElevenLabs, Apple, Vercel, Linear)
    finalColors = sortMonochromeLuxury(rankedMonochrome);
  }

  const finalNeutrals = ['#000000', '#ffffff'];

  return { colors: finalColors, neutrals: finalNeutrals };
}

/** Resolves a possibly-relative asset URL against the page it was found on. */
function absolutize(href, base) {
  try {
    return new URL(href, base).href;
  } catch (_) {
    return href;
  }
}

/**
 * Detects the semantic brand theme: theme mode (dark vs light), background colors,
 * primary and secondary brand accents, contrast typography colors, and glassmorphism tokens.
 */
export function detectTheme(html, colors = [], neutrals = []) {
  let isDark = false;
  let bgPrimary = '#080a10';
  let bgSecondary = '#121620';

  // 1. Inspect meta theme-color
  const metaTheme = html.match(/<meta[^>]+(?:name|property)=["'](?:theme-color)["'][^>]+content=["']([^"']+)["']/i);
  if (metaTheme && metaTheme[1]) {
    const p = parseColor(metaTheme[1]);
    if (p) {
      const hsl = toHsl(p);
      if (hsl.l <= 0.35) {
        isDark = true;
        bgPrimary = toHex(p);
      } else if (hsl.l >= 0.70) {
        isDark = false;
        bgPrimary = toHex(p);
      }
    }
  }

  // 2. Inspect html/body class indicators
  if (!metaTheme) {
    if (/class=["'][^"']*\b(dark|dark-mode|dark-theme|theme-dark)\b[^"']*["']/i.test(html) ||
        /data-theme=["']dark["']/i.test(html)) {
      isDark = true;
    } else if (/class=["'][^"']*\b(light|light-mode|light-theme|theme-light)\b[^"']*["']/i.test(html) ||
               /data-theme=["']light["']/i.test(html)) {
      isDark = false;
    } else {
      const bodyBgMatch = html.match(/(?:body|html)[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}\s]+)/i);
      if (bodyBgMatch && bodyBgMatch[1]) {
        const p = parseColor(bodyBgMatch[1]);
        if (p) {
          const hsl = toHsl(p);
          isDark = hsl.l <= 0.40;
          bgPrimary = toHex(p);
        }
      }
    }
  }

  const allHexes = [...colors, ...neutrals];
  const darkCandidates = allHexes.filter(h => {
    const p = parseColor(h);
    return p && toHsl(p).l <= 0.20;
  });
  const lightCandidates = allHexes.filter(h => {
    const p = parseColor(h);
    return p && toHsl(p).l >= 0.82;
  });

  if (isDark || (darkCandidates.length >= 2 && (!lightCandidates.length || darkCandidates[0] === '#030304' || darkCandidates[0] === '#000000'))) {
    isDark = true;
    if (darkCandidates.length > 0) bgPrimary = darkCandidates[0];
    if (darkCandidates.length > 1) bgSecondary = darkCandidates[1];
    else bgSecondary = '#121620';
  } else {
    isDark = false;
    if (lightCandidates.length > 0) bgPrimary = lightCandidates[0];
    else bgPrimary = '#ffffff';
    bgSecondary = '#f8fafc';
  }

  // Extract chromatic brand accents
  const chromatic = colors.filter(h => {
    const p = parseColor(h);
    return p && toHsl(p).s >= 0.25 && toHsl(p).l > 0.15 && toHsl(p).l < 0.88;
  });

  let primaryAccent = chromatic[0] || (isDark ? '#00cbd6' : '#2563eb');
  let secondaryAccent = chromatic[1] || (isDark ? '#818cf8' : '#4f46e5');

  if (!chromatic.length) {
    primaryAccent = isDark ? '#ffffff' : '#09090b';
    secondaryAccent = isDark ? '#94a3b8' : '#475569';
  }

  const textColor = isDark ? '#ffffff' : '#09090b';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const glassCardBg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.75)';
  const glassCardBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return {
    mode: isDark ? 'dark' : 'light',
    bgPrimary,
    bgSecondary,
    primaryAccent,
    secondaryAccent,
    textColor,
    textMuted,
    glassCardBg,
    glassCardBorder
  };
}

/**
 * Pulls the things a motion designer actually needs off a marketing page: the palette,
 * the theme system, the typefaces, the headline copy, and the logo.
 */
export function extractBrand(html, url) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const description = descMatch ? decodeEntities(descMatch[1]).trim() : '';

  // Colours: the few the brand owns, told apart from the greys and near-whites the page
  // uses for surfaces. See extractPalette — ranking every literal value by frequency is
  // what used to hand the planner fourteen "brand colours".
  const { colors, neutrals } = extractPalette(html);
  const theme = detectTheme(html, colors, neutrals);

  // Fonts: Google Fonts links first (they name the family unambiguously), then any
  // font-family declaration left in inline CSS.
  const fontSet = new Set();
  const gfMatches = html.match(/fonts\.googleapis\.com\/css2?\?[^"'>]+/gi) || [];
  gfMatches.forEach(link => {
    (link.match(/family=([^&:"']+)/gi) || []).forEach(fam => {
      const name = decodeURIComponent(fam.replace(/^family=/i, '')).replace(/\+/g, ' ').split(':')[0].trim();
      if (name) fontSet.add(name);
    });
  });
  (html.match(/font-family\s*:\s*([^;}"']+)/gi) || []).forEach(decl => {
    decl.replace(/^font-family\s*:\s*/i, '')
      .split(',')
      .map(f => f.replace(/["']/g, '').trim())
      .filter(f => f && !/^(inherit|initial|unset|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(f))
      .slice(0, 2)
      .forEach(f => fontSet.add(f));
  });
  const fonts = [...fontSet].slice(0, 10);

  const headings = [];
  ['h1', 'h2', 'h3'].forEach(tag => {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    [...html.matchAll(re)].forEach(m => {
      const text = stripTags(m[1]);
      if (text && text.length < 200) headings.push(text);
    });
  });

  const copy = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => stripTags(m[1]))
    .filter(t => t.length > 30)
    .slice(0, 12);

  const assets = [];
  const og = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og) assets.push({ kind: 'og:image', url: absolutize(og[1], url) });
  const icon = html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i);
  if (icon) assets.push({ kind: 'icon', url: absolutize(icon[1], url) });
  [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].slice(0, 12).forEach(m => {
    const src = m[1];
    if (src.startsWith('data:')) return;
    const kind = /logo|brand|mark/i.test(m[0]) ? 'logo' : 'image';
    assets.push({ kind, url: absolutize(src, url) });
  });

  return { title, description, colors, neutrals, theme, fonts, headings: headings.slice(0, 12), copy, assets: assets.slice(0, 16) };
}

/** Renders an extraction into the compact text block the model reads. */
export function formatBrand(brand, url) {
  const out = [`Page: ${url}`];
  if (brand.title) out.push(`Title: ${brand.title}`);
  if (brand.description) out.push(`Description: ${brand.description}`);
  
  if (brand.theme) {
    out.push(`\n### 🎨 BRAND THEME & COLOR ROLE SYSTEM (STRICT BINDING):`);
    out.push(`• Theme Mode: ${brand.theme.mode.toUpperCase()} MODE (Must strictly match website branding)`);
    out.push(`• Background Canvas (--bg-primary): ${brand.theme.bgPrimary} (Stage canvas background)`);
    out.push(`• Surface/Card Background (--bg-secondary): ${brand.theme.bgSecondary} (Backdrop panels & secondary containers)`);
    out.push(`• Primary Brand Accent (--accent-primary): ${brand.theme.primaryAccent} (Key highlight, hero badges, active buttons, neon glow)`);
    out.push(`• Secondary Brand Accent (--accent-secondary): ${brand.theme.secondaryAccent} (Gradients, secondary chips, subtle glows)`);
    out.push(`• Text Primary (--text-primary): ${brand.theme.textColor} (Headlines & primary body text)`);
    out.push(`• Text Muted (--text-muted): ${brand.theme.textMuted} (Subtitles & timestamps)`);
    out.push(`• Glassmorphism: card ${brand.theme.glassCardBg}, border 1px solid ${brand.theme.glassCardBorder}`);
  }

  if (brand.colors?.length) {
    out.push(`Brand colours (primary first — this is the palette): ${brand.colors.join(', ')}`);
  }
  if (brand.neutrals?.length) {
    out.push(`Neutrals (backgrounds and type, not brand colours): ${brand.neutrals.join(', ')}`);
  }
  if (brand.fonts.length) out.push(`Typefaces: ${brand.fonts.join(', ')}`);
  if (brand.headings.length) out.push(`\nHeadings:\n${brand.headings.map(h => `  • ${h}`).join('\n')}`);
  if (brand.copy.length) out.push(`\nBody copy:\n${brand.copy.map(p => `  • ${p.slice(0, 300)}`).join('\n')}`);
  if (brand.assets.length) {
    out.push(`\nAssets (pass a url to download_asset to fetch one):\n${brand.assets.map(a => `  • [${a.kind}] ${a.url}`).join('\n')}`);
  }
  return out.join('\n');
}

async function get(url, signal) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: signal || AbortSignal.timeout(FETCH_TIMEOUT)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res;
}

/**
 * Draws a placeholder that is worth looking at.
 *
 * The failure this exists for: the agent references a logo URL, the URL 404s, and the
 * composition renders with a broken-image glyph and a collapsed box — so one dead link
 * wrecks the layout of an otherwise finished film. A generated SVG keeps the exact
 * dimensions the layout expects and carries the brand colour, so the frame still reads
 * as designed even when the real asset never arrives.
 */
export function placeholderSvg(opts = {}) {
  const w = Math.max(16, Math.round(opts.width || 512));
  const h = Math.max(16, Math.round(opts.height || 512));
  const label = String(opts.label || '').slice(0, 24);
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(opts.color || '') ? opts.color : '#00f5ff';
  const kind = opts.kind || 'logo';
  const id = Math.abs(hashString(label + accent + kind)).toString(36).slice(0, 6);

  const words = label.split(/[\s\-_.]+/).filter(Boolean);
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (label.slice(0, 2).toUpperCase() || 'AI');

  const min = Math.min(w, h);
  const rx = Math.round(min * 0.22);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(label || kind)}">
  <defs>
    <linearGradient id="bg_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#161b26" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#090d16" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="border_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.8"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.1"/>
    </linearGradient>
    <linearGradient id="glow_${id}" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="text_${id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <!-- Background Card -->
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${rx}" fill="url(#bg_${id})" />
  <!-- Inner Ambient Glow -->
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${rx}" fill="url(#glow_${id})" />
  <!-- Specular Glass Border -->
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${rx}" fill="none" stroke="url(#border_${id})" stroke-width="2.5" />
  <!-- Vector Monogram -->
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Inter', sans-serif" font-weight="800" font-size="${Math.round(min * 0.42)}" fill="url(#text_${id})" letter-spacing="-0.03em">${escapeXml(initials)}</text>
</svg>`;
}

function escapeXml(str) {
  return String(str).replace(/[<>&"']/g, ch =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

/** Image bytes that are technically a 200 but useless — tracking pixels, empty SVGs. */
function looksLikeRealImage(buf, contentType) {
  if (buf.length < 64) return false;
  if (/^image\/svg/i.test(contentType)) {
    const head = buf.slice(0, 2000).toString('utf-8');
    return /<svg[\s>]/i.test(head);
  }
  if (/^(text\/html|application\/json)/i.test(contentType)) return false;
  // A soft-404 often serves an HTML error page with a 200 status.
  const head = buf.slice(0, 400).toString('utf-8').trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return false;
  return true;
}

export const webTools = [
  {
    name: 'fetch_page',
    description:
      'Fetch a web page and extract its brand system: colour palette, typefaces, headline copy, and downloadable ' +
      'assets such as the logo. Use this whenever the user gives you a URL, or when you want the real wording and ' +
      'colours of a product instead of inventing them.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL including https://' }
      },
      required: ['url']
    },
    async run(input, ctx) {
      if (!/^https?:\/\//i.test(input.url)) throw new Error('url must start with http:// or https://');
      const res = await get(input.url, ctx.signal);
      const html = await res.text();
      const brand = extractBrand(html, input.url);
      return {
        content: formatBrand(brand, input.url),
        meta: {
          brand,
          colors: brand.colors,
          fonts: brand.fonts,
          assets: brand.assets.length
        }
      };
    },
    summarize(input, result) {
      const m = result.meta || {};
      const cols = m.colors && m.colors.length ? m.colors.slice(0, 3).join(', ') : 'no colours';
      const fts = m.fonts && m.fonts.length ? m.fonts.slice(0, 2).join(', ') : 'default font';
      return `Extracted [${cols}] · ${fts} · ${m.assets || 0} assets`;
    },
    label(input) {
      try { return `FetchBrand(${new URL(input.url).hostname})`; } catch (_) { return 'FetchBrand(url)'; }
    }
  },

  {
    name: 'web_search',
    description:
      'Search the web and get back result titles, URLs, and snippets. Use it to find a brand site, a reference ' +
      'animation, a colour system, or documentation you do not already have a URL for. Follow up with fetch_page ' +
      'on whichever result looks right.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' }
      },
      required: ['query']
    },
    async run(input, ctx) {
      // DuckDuckGo's HTML endpoint needs no key and no account, which keeps research
      // working out of the box rather than behind yet another API key in the config.
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
      let html;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `q=${encodeURIComponent(input.query)}`,
          signal: ctx.signal || AbortSignal.timeout(FETCH_TIMEOUT)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
      } catch (err) {
        // A failed search is a normal outcome, not a crash: report it so the model can
        // fall back to fetch_page or ask the user, instead of aborting the whole build.
        return { content: `Search failed: ${err.message}. Try fetch_page with a URL directly.`, meta: { count: 0 } };
      }

      const results = [];
      const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      for (const m of html.matchAll(re)) {
        if (results.length >= 10) break;
        let href = decodeEntities(m[1]);
        // DDG wraps outbound links; unwrap so the model gets a URL it can fetch.
        const wrapped = href.match(/[?&]uddg=([^&]+)/);
        if (wrapped) href = decodeURIComponent(wrapped[1]);
        if (href.startsWith('//')) href = 'https:' + href;
        results.push({ title: stripTags(m[2]), url: href });
      }

      const snippets = [...html.matchAll(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m => stripTags(m[1]));
      results.forEach((r, i) => { r.snippet = snippets[i] || ''; });

      if (!results.length) {
        return { content: `No results for "${input.query}".`, meta: { count: 0 } };
      }
      return {
        content: results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet.slice(0, 240)}`).join('\n\n'),
        meta: { count: results.length }
      };
    },
    summarize(input, result) {
      return `${result.meta.count} result${result.meta.count === 1 ? '' : 's'}`;
    },
    label(input) { return `Search(${String(input.query).slice(0, 40)})`; }
  },

  {
    name: 'download_asset',
    description:
      'Download a file from a URL into the project folder — a logo, an icon, a texture, a font file. ' +
      'Pro-tip for logos: Use https://cdn.simpleicons.org/{brand_name} (e.g. spotify, apple, slack, stripe, github, figma, notion, discord) to download official vector SVG logos directly into assets/logo.svg! ' +
      'Never leave an image src pointing at a remote URL in a composition: download it first so the render works offline. ' +
      'If the URL is dead, this tool writes a styled SVG placeholder at the same path instead of failing.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL of the file.' },
        filename: { type: 'string', description: 'Where to save it, relative to the project, e.g. assets/logo.svg' },
        fallback_label: { type: 'string', description: 'Short name for the placeholder if the download fails, e.g. "Acme Corp".' },
        fallback_color: { type: 'string', description: 'Hex accent for the placeholder, e.g. #2B64F4. Defaults to indigo.' },
        fallback_kind: { type: 'string', enum: ['logo', 'icon', 'image'], description: 'What the asset was meant to be. Shapes the placeholder. Default image.' },
        width: { type: 'number', description: 'Placeholder width in px. Default 512.' },
        height: { type: 'number', description: 'Placeholder height in px. Default 512.' }
      },
      required: ['url', 'filename']
    },
    mutates: true,
    preview(input) {
      return { title: `download ${input.filename}`, lines: [input.url] };
    },
    async run(input, ctx) {
      if (!/^https?:\/\//i.test(input.url)) throw new Error('url must start with http:// or https://');
      const target = assertWritable(ctx.project.dir, input.filename);

      /** Writes the generated SVG at the requested path and explains why. */
      const writePlaceholder = (reason) => {
        const svg = placeholderSvg({
          width: input.width,
          height: input.height,
          label: input.fallback_label || path.basename(input.filename).replace(/\.\w+$/, ''),
          color: input.fallback_color,
          kind: input.fallback_kind || (/logo|mark|brand/i.test(input.filename) ? 'logo' : 'image')
        });
        // The extension has to match the bytes or the browser refuses to render it, and
        // the composition would reference a .png that is actually SVG markup.
        const svgPath = input.filename.replace(/\.\w+$/, '') + '.svg';
        const svgTarget = assertWritable(ctx.project.dir, svgPath);
        ensureDir(svgTarget);
        fs.writeFileSync(svgTarget, svg, 'utf-8');
        return {
          content:
            `Could not download ${input.url} — ${reason}.\n` +
            `Wrote a styled SVG placeholder to ${svgPath} instead, so the layout keeps its box and nothing renders broken.\n` +
            `Reference it as "${svgPath.replace(/\\/g, '/')}" — NOT "${input.filename}", which does not exist.\n` +
            `If you need the real asset, try fetch_page on the brand site to find a working URL.`,
          meta: { kb: Math.round(svg.length / 1024) || 1, placeholder: true, path: svgPath }
        };
      };

      let res;
      try {
        res = await get(input.url, ctx.signal);
      } catch (err) {
        return writePlaceholder(err.message);
      }

      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > MAX_ASSET_BYTES) {
        throw new Error(`Asset is ${Math.round(declared / 1024 / 1024)} MB, over the ${MAX_ASSET_BYTES / 1024 / 1024} MB limit.`);
      }

      let buf;
      try {
        buf = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        return writePlaceholder(`the response body could not be read (${err.message})`);
      }

      if (buf.length > MAX_ASSET_BYTES) {
        throw new Error(`Asset is ${Math.round(buf.length / 1024 / 1024)} MB, over the limit.`);
      }

      const contentType = res.headers.get('content-type') || '';
      const wantsImage = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i.test(input.filename) ||
        /^image\//i.test(contentType);

      // A 200 that carries an HTML error page is the failure that actually breaks
      // layouts, because nothing upstream treats it as an error.
      if (wantsImage && !looksLikeRealImage(buf, contentType)) {
        return writePlaceholder(
          `the server returned ${buf.length} bytes of ${contentType || 'unknown type'}, which is not a usable image (likely a soft 404)`
        );
      }

      ensureDir(target);
      fs.writeFileSync(target, buf);
      const kb = Math.max(1, Math.round(buf.length / 1024));
      return {
        content: `Saved ${input.filename} (${kb} KB, ${contentType || 'unknown type'}). ` +
          `Reference it in the composition as "${input.filename.replace(/\\/g, '/')}".`,
        meta: { kb, placeholder: false }
      };
    },
    summarize(input, result) {
      return result.meta.placeholder ? `dead link → SVG placeholder` : `${result.meta.kb} KB`;
    },
    label(input) { return `Download(${path.basename(input.filename)})`; }
  },

  {
    name: 'make_placeholder',
    description:
      'Generate a styled SVG placeholder in the project without downloading anything. Use it when you know no ' +
      'real asset exists — a fictional product logo, a screenshot you cannot source, an avatar. ' +
      'It draws a gradient card in your accent colour with initials or a glyph, sized to whatever the layout ' +
      'needs, so the frame reads as designed rather than showing an empty box.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Where to save it, e.g. assets/acme-logo.svg' },
        label: { type: 'string', description: 'Text or name it represents, e.g. "Acme Corp". Initials are drawn for logos.' },
        color: { type: 'string', description: 'Hex accent, e.g. #2B64F4.' },
        kind: { type: 'string', enum: ['logo', 'icon', 'image'], description: 'Default image.' },
        width: { type: 'number', description: 'Default 512.' },
        height: { type: 'number', description: 'Default 512.' }
      },
      required: ['filename']
    },
    mutates: true,
    preview(input) {
      return {
        title: `create placeholder ${input.filename}`,
        lines: [`${input.kind || 'image'} · ${input.width || 512}×${input.height || 512} · ${input.color || '#6366f1'}`]
      };
    },
    run(input, ctx) {
      const svgPath = input.filename.replace(/\.\w+$/, '') + '.svg';
      const target = assertWritable(ctx.project.dir, svgPath);
      const svg = placeholderSvg({
        width: input.width,
        height: input.height,
        label: input.label || path.basename(svgPath).replace(/\.svg$/, ''),
        color: input.color,
        kind: input.kind
      });
      ensureDir(target);
      fs.writeFileSync(target, svg, 'utf-8');
      return {
        content: `Created ${svgPath} — a ${input.width || 512}×${input.height || 512} ${input.kind || 'image'} placeholder. ` +
          `Reference it as "${svgPath.replace(/\\/g, '/')}".`,
        meta: { path: svgPath }
      };
    },
    summarize(input) { return `${input.kind || 'image'} placeholder`; },
    label(input) { return `Placeholder(${path.basename(input.filename)})`; }
  }
];
