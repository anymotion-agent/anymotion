/**
 * PRE-PLAN RESEARCH
 *
 * When a brief contains a link, the link *is* the brief. "Make an explainer for
 * https://linear.app" is not a request to invent a purple SaaS animation — it is a
 * request to build something that looks like Linear, and the only way to know what that
 * means is to go and look.
 *
 * The old path did try: enrichPromptWithUrlContext() scraped the last user message before
 * the plan call. But it was invisible (a console.warn in a raw-mode TUI is either
 * swallowed or it corrupts the frame), it stopped at the first page, and — the part that
 * actually mattered — it handed the planner a list of asset URLs nobody had checked. Half
 * of those are hotlink-protected or already dead, so the plan would confidently promise a
 * logo that could never load, and the composition would render a broken box.
 *
 * So this module does three things the old one did not:
 *
 *   1. reports progress, so the user watches the research happen instead of staring at a
 *      spinner that says "planning" for eleven seconds;
 *   2. follows a couple of same-origin pages when the entry page is thin on copy, because
 *      a marketing homepage is often three words and a hero video;
 *   3. probes every asset it found and marks each one live or dead, so the plan is built
 *      only from assets that actually exist.
 *
 * It is deliberately not an agent. The plan call is a single non-agentic JSON request, and
 * this runs before it — deterministic, bounded, and safe to fail. Every failure degrades
 * to "we could not read the site", never to a thrown error, because a slow CDN must not
 * be the reason a build cannot start.
 */

import { extractBrand, formatBrand } from './tools/web-tools.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const PAGE_TIMEOUT = 12_000;
const ASSET_TIMEOUT = 7000;

const MAX_URLS = 3;          // three sites is already an unusual brief
const MAX_FOLLOWS = 2;       // per entry page, and only when it looked thin
const MAX_ASSET_PROBES = 8;  // enough to find a real logo without stalling the plan

/** Pages worth following when the entry page has almost no copy on it. */
const FOLLOW_HINTS = /\/(about|about-us|product|products|features|pricing|solutions|company|why|platform)\/?$/i;

export function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const found = text.match(/https?:\/\/[^\s<>'")\]]+/gi) || [];
  const cleaned = found.map(u => u.replace(/[.,;:!?)]+$/, ''));
  return [...new Set(cleaned)].slice(0, MAX_URLS);
}

/** True when the brief points at a website, so the caller can skip asking about colours. */
export function hasUrl(text) {
  return extractUrls(text).length > 0;
}

async function getText(url, signal) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
    signal: signal || AbortSignal.timeout(PAGE_TIMEOUT)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Confirms an asset URL will actually load.
 *
 * HEAD first because it is free, then a one-byte ranged GET when HEAD is refused — plenty
 * of CDNs answer 405 to HEAD and 200 to GET, and treating those as dead would throw away
 * the real logo. A server that ignores the Range header sends the whole file; that is the
 * price of certainty, and it is why this is capped at eight probes.
 */
async function probeAsset(url, signal) {
  const headers = { 'User-Agent': UA, 'Accept': 'image/*,*/*' };
  try {
    const head = await fetch(url, {
      method: 'HEAD', headers, redirect: 'follow',
      signal: signal || AbortSignal.timeout(ASSET_TIMEOUT)
    });
    if (head.ok) {
      return { ok: true, type: head.headers.get('content-type') || '', bytes: Number(head.headers.get('content-length')) || 0 };
    }
    if (head.status !== 405 && head.status !== 501 && head.status !== 403) {
      return { ok: false, why: `HTTP ${head.status}` };
    }
  } catch (err) {
    if (signal?.aborted) throw err;
  }

  try {
    const res = await fetch(url, {
      headers: { ...headers, Range: 'bytes=0-0' }, redirect: 'follow',
      signal: signal || AbortSignal.timeout(ASSET_TIMEOUT)
    });
    if (!res.ok && res.status !== 206) return { ok: false, why: `HTTP ${res.status}` };
    // The body is drained so the socket is released rather than left half-read.
    try { await res.arrayBuffer(); } catch (_) {}
    return { ok: true, type: res.headers.get('content-type') || '', bytes: 0 };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, why: err.name === 'TimeoutError' ? 'timed out' : (err.message || 'unreachable').slice(0, 60) };
  }
}

/** Same-origin links from the raw HTML that look like they carry real product copy. */
function followCandidates(html, baseUrl) {
  let origin;
  try { origin = new URL(baseUrl).origin; } catch (_) { return []; }

  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map(m => m[1]);
  const abs = [];
  for (const href of hrefs) {
    let full;
    try { full = new URL(href, baseUrl).toString(); } catch (_) { continue; }
    if (!full.startsWith(origin)) continue;
    if (full.replace(/\/$/, '') === baseUrl.replace(/\/$/, '')) continue;
    if (!FOLLOW_HINTS.test(new URL(full).pathname)) continue;
    if (!abs.includes(full)) abs.push(full);
    if (abs.length >= MAX_FOLLOWS) break;
  }
  return abs;
}

/**
 * Reads every URL in the brief and returns a block the planner can be handed verbatim.
 *
 * @param {string}   text            the user's message
 * @param {object}   [opts]
 * @param {Function} [opts.emit]     ({ type, url, detail }) progress sink for the TUI
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<null|{ urls, block, brands, liveAssets, deadAssets }>}
 *          null when the brief has no links at all — the caller skips the whole step.
 */
export async function researchBrief(text, opts = {}) {
  const urls = extractUrls(text);
  if (!urls.length) return null;

  const emit = typeof opts.emit === 'function' ? opts.emit : () => {};
  const signal = opts.signal;

  const brands = [];
  const blocks = [];
  const liveAssets = [];
  const deadAssets = [];
  const failures = [];

  for (const url of urls) {
    if (signal?.aborted) break;

    emit({ type: 'fetch', url });
    let html;
    try {
      html = await getText(url, signal);
    } catch (err) {
      failures.push({ url, why: err.message });
      emit({ type: 'fail', url, detail: err.message });
      continue;
    }

    const brand = extractBrand(html, url);
    brands.push(brand);
    blocks.push(formatBrand(brand, url));
    emit({
      type: 'page',
      url,
      detail: `${brand.colors.length} colours · ${brand.fonts.length} typefaces · ${brand.assets.length} assets`
    });

    // A hero-video homepage can carry almost no text. One or two inner pages usually
    // contain the sentences the script should actually be written from.
    const copyChars = brand.copy.reduce((n, p) => n + p.length, 0);
    if (copyChars < 600) {
      for (const next of followCandidates(html, url)) {
        if (signal?.aborted) break;
        emit({ type: 'fetch', url: next });
        try {
          const sub = extractBrand(await getText(next, signal), next);
          brands.push(sub);
          blocks.push(formatBrand(sub, next));
          emit({ type: 'page', url: next, detail: `${sub.copy.length} copy blocks` });
        } catch (err) {
          emit({ type: 'fail', url: next, detail: err.message });
        }
      }
    }
  }

  // Logos first: they are the asset a composition actually needs, and the one most often
  // hotlink-protected, so they are the ones worth spending probes on.
  const candidates = [];
  brands.forEach(b => b.assets.forEach(a => {
    if (!candidates.some(x => x.url === a.url)) candidates.push(a);
  }));
  const ranked = [
    ...candidates.filter(a => a.kind === 'logo' || /logo|mark|brand/i.test(a.url)),
    ...candidates.filter(a => !(a.kind === 'logo' || /logo|mark|brand/i.test(a.url)))
  ].slice(0, MAX_ASSET_PROBES);

  for (const asset of ranked) {
    if (signal?.aborted) break;
    const probe = await probeAsset(asset.url, signal);
    if (probe.ok) {
      liveAssets.push({ ...asset, type: probe.type });
      emit({ type: 'asset', url: asset.url, ok: true });
    } else {
      deadAssets.push({ ...asset, why: probe.why });
      emit({ type: 'asset', url: asset.url, ok: false, detail: probe.why });
    }
  }

  if (!blocks.length && !liveAssets.length) {
    return {
      urls,
      brands: [],
      liveAssets: [],
      deadAssets: [],
      block:
        `### RESEARCH ATTEMPTED — NOTHING COULD BE READ\n` +
        failures.map(f => `  • ${f.url} — ${f.why}`).join('\n') +
        `\nBuild from the written brief alone, and tell the user the site could not be read ` +
        `so they know the palette and copy are your invention rather than theirs.`
    };
  }

  const parts = [
    `### RESEARCH — fetched live from the link(s) in the brief`,
    `This is real scraped data, not your assumption. Build the plan from it: use these ` +
    `colours, these typefaces and this wording rather than inventing a palette or a script.`,
    '',
    blocks.join('\n\n')
  ];

  if (liveAssets.length) {
    parts.push(
      '',
      `VERIFIED ASSETS — each of these was requested and answered, so download_asset will succeed:`,
      ...liveAssets.map(a => `  ✓ [${a.kind}] ${a.url}${a.type ? ` (${a.type})` : ''}`)
    );
  }
  if (deadAssets.length) {
    parts.push(
      '',
      `DEAD ASSETS — these were on the page but do not load. Do NOT reference them; use ` +
      `make_placeholder instead if you need something in that slot:`,
      ...deadAssets.map(a => `  ✗ ${a.url} — ${a.why}`)
    );
  }
  if (failures.length) {
    parts.push('', `Could not read: ${failures.map(f => `${f.url} (${f.why})`).join(', ')}`);
  }

  return { urls, brands, liveAssets, deadAssets, block: parts.join('\n') };
}
