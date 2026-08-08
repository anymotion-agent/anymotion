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

/** Resolves a possibly-relative asset URL against the page it was found on. */
function absolutize(href, base) {
  try {
    return new URL(href, base).href;
  } catch (_) {
    return href;
  }
}

/**
 * Pulls the things a motion designer actually needs off a marketing page: the palette,
 * the typefaces, the headline copy, and the logo.
 */
export function extractBrand(html, url) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  const descMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const description = descMatch ? decodeEntities(descMatch[1]).trim() : '';

  // Colours: literal hex plus whatever sits in custom properties, which is where
  // design systems keep the real brand values.
  const hex = html.match(/#[0-9a-fA-F]{6}\b/g) || [];
  const rgb = html.match(/rgba?\([^)]+\)/g) || [];
  const frequency = new Map();
  [...hex, ...rgb].forEach(cVal => {
    const key = cVal.toLowerCase();
    frequency.set(key, (frequency.get(key) || 0) + 1);
  });
  const colors = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)
    .filter(v => !/^#(fff{3}|000{3})$/.test(v))
    .slice(0, 14);

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

  return { title, description, colors, fonts, headings: headings.slice(0, 12), copy, assets: assets.slice(0, 16) };
}

/** Renders an extraction into the compact text block the model reads. */
export function formatBrand(brand, url) {
  const out = [`Page: ${url}`];
  if (brand.title) out.push(`Title: ${brand.title}`);
  if (brand.description) out.push(`Description: ${brand.description}`);
  if (brand.colors.length) out.push(`Colours (most frequent first): ${brand.colors.join(', ')}`);
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
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(opts.color || '') ? opts.color : '#6366f1';
  const kind = opts.kind || 'image';
  const id = Math.abs(hashString(label + accent + kind)).toString(36).slice(0, 6);

  // Initials read better than a filename at small sizes and never overflow the box.
  const initials = label
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('') || '?';

  const min = Math.min(w, h);
  const glyph = {
    logo: `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-weight="700" font-size="${Math.round(min * 0.34)}" fill="url(#g${id})" letter-spacing="-0.02em">${escapeXml(initials)}</text>`,
    icon: `<g stroke="url(#g${id})" stroke-width="${Math.max(1.5, min * 0.05)}" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="${min * 0.28}" y="${min * 0.28}" width="${min * 0.44}" height="${min * 0.44}" rx="${min * 0.09}"/>
      <circle cx="${w / 2}" cy="${h / 2}" r="${min * 0.08}"/>
    </g>`,
    image: `<g stroke="url(#g${id})" stroke-width="${Math.max(1.5, min * 0.035)}" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="${w * 0.2}" y="${h * 0.24}" width="${w * 0.6}" height="${h * 0.52}" rx="${min * 0.06}"/>
      <circle cx="${w * 0.36}" cy="${h * 0.4}" r="${min * 0.055}"/>
      <path d="M ${w * 0.22} ${h * 0.68} L ${w * 0.4} ${h * 0.5} L ${w * 0.55} ${h * 0.62} L ${w * 0.66} ${h * 0.53} L ${w * 0.78} ${h * 0.68}"/>
    </g>`
  }[kind] || '';

  const caption = label && kind !== 'logo'
    ? `<text x="50%" y="${h - Math.max(10, h * 0.07)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="${Math.round(min * 0.075)}" fill="${accent}" opacity="0.55">${escapeXml(label)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(label || kind)}">
  <defs>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.04"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" rx="${Math.round(min * 0.08)}" fill="url(#bg${id})"/>
  <rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="${Math.round(min * 0.08)}" fill="none" stroke="${accent}" stroke-opacity="0.28" stroke-width="1.5"/>
  ${glyph}
  ${caption}
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
        meta: { colors: brand.colors.length, fonts: brand.fonts.length, assets: brand.assets.length }
      };
    },
    summarize(input, result) {
      const m = result.meta;
      return `${m.colors} colours · ${m.fonts} fonts · ${m.assets} assets`;
    },
    label(input) {
      try { return `Fetch(${new URL(input.url).hostname})`; } catch (_) { return 'Fetch(url)'; }
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
