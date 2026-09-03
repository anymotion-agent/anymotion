/**
 * write-time feedback tests: syntax healing + cross-file contract reporting.
 *
 * These run the REAL tools (write_file, edit_file, grep_files) against a temp project,
 * because what matters is what the model actually sees in the tool result:
 *
 *   1. A valid file with "{" inside a string must never get closers appended — the old
 *      bracket counter corrupted exactly those files, and the model then debugged
 *      corruption it did not cause.
 *   2. A genuinely truncated file gets healed when closers rescue it.
 *   3. A file that still does not parse is written, but the result says so loudly.
 *   4. Writing timeline.js against an index.html whose ids don't match reports the
 *      mismatch in the same tool result — the fix for the endless-debugging loop.
 *   5. grep_files honours glob and context.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { fsTools, resetFileMemory } from '../src/agent/tools/fs-tools.js';

const tool = (name) => fsTools.find(t => t.name === name);

let dir;
const write = (name, content) => fs.writeFileSync(path.join(dir, name), content, 'utf-8');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf-8');
const run = (name, input) => tool(name).run(input, { project: { dir } });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anymotion-fstools-'));
  resetFileMemory();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('syntax healer is parse-first', () => {
  test('valid JS with braces inside strings is left byte-identical', () => {
    // The old counter saw 2 extra "{" here and appended garbage "}\n}" — this is the
    // exact corruption the parse-first rewrite exists to prevent.
    const src = `const s = "a { b";\nconst t = 'c { d';\nconsole.log(s, t);\n`;
    const r = run('write_file', { path: 'app.js', content: src });
    assert.equal(read('app.js'), src);
    assert.doesNotMatch(r.content, /SYNTAX ERROR/);
  });

  test('valid JS with odd brace count in comments is left alone', () => {
    const src = `// comment with { unbalanced\nconst x = 1;\n`;
    run('write_file', { path: 'app.js', content: src });
    assert.equal(read('app.js'), src);
  });

  test('genuinely truncated JS gets closers appended and then parses', () => {
    const src = `function scene() {\n  if (true) {\n    el.style.opacity = 1;\n`;
    run('write_file', { path: 'app.js', content: src });
    const out = read('app.js');
    assert.ok(out.length > src.length, 'closers were appended');
    assert.doesNotThrow(() => new Function(out), 'healed output parses');
  });

  test('unparseable JS is written as-is but the result reports the syntax error', () => {
    const src = `const = broken syntax here\n`;
    const r = run('write_file', { path: 'app.js', content: src });
    assert.equal(read('app.js'), src);
    assert.match(r.content, /SYNTAX ERROR/);
  });

  test('heal that does not rescue the parse is rolled back — no junk appended', () => {
    const src = `const x = "unterminated\n`;
    const r = run('write_file', { path: 'app.js', content: src });
    // Whatever landed on disk, it must not have closers bolted onto a non-bracket error.
    assert.doesNotMatch(read('app.js'), /\}+$/);
    assert.match(r.content, /SYNTAX ERROR/);
  });
});

describe('write-time cross-file contract feedback', () => {
  test('near-miss ids in timeline.js are auto-corrected to the HTML spelling', () => {
    write('index.html', `<div id="playbtn"></div>\n`);
    const r = run('write_file', {
      path: 'timeline.js',
      content: `const btn = document.getElementById('play-btn');\n`
    });
    assert.match(r.content, /AUTO-CORRECTED 1 near-miss/);
    assert.match(r.content, /'play-btn'\) → 'playbtn'/);
    // The disk now holds the corrected reference — the files agree.
    assert.match(read('timeline.js'), /getElementById\('playbtn'\)/);
  });

  test('mismatches with NO near candidate are reported, not guessed at', () => {
    write('index.html', `<div id="stage"></div>\n`);
    const r = run('write_file', {
      path: 'timeline.js',
      content: `const btn = document.getElementById('zebra');\n`
    });
    assert.match(r.content, /CROSS-FILE MISMATCHES/);
    assert.match(r.content, /zebra/);
    assert.equal(read('timeline.js').includes("'zebra'"), true, 'unfixable ref left untouched');
  });

  test('writing matching files stays quiet', () => {
    write('index.html', `<div id="stage"></div>\n`);
    const r = run('write_file', {
      path: 'timeline.js',
      content: `const s = document.getElementById('stage');\n`
    });
    assert.doesNotMatch(r.content, /CROSS-FILE|AUTO-CORRECTED/);
  });

  test('writing index.html auto-corrects the existing JS to match it', () => {
    write('timeline.js', `document.querySelector('#play-btn');\n`);
    const r = run('write_file', {
      path: 'index.html',
      content: `<html><body><div id="playbtn"></div></body></html>\n`
    });
    assert.match(r.content, /AUTO-CORRECTED/);
    assert.match(read('timeline.js'), /'#playbtn'/);
  });

  test('writing a big index.html returns the naming manifest for the next file', () => {
    const r = run('write_file', {
      path: 'index.html',
      content: `<html><body><div id="stage" class="scene"><div id="tc" class="tc">00:00</div></div></body></html>\n`
    });
    assert.match(r.content, /NAMING CONTRACT/);
    assert.match(r.content, /ids \(2\): stage, tc/);
    assert.match(r.content, /classes \(2\): scene, tc/);
  });

  test('js writes do not carry the manifest', () => {
    write('index.html', `<div id="stage"></div>\n`);
    const r = run('write_file', {
      path: 'timeline.js',
      content: `const s = document.getElementById('stage');\n`
    });
    assert.doesNotMatch(r.content, /NAMING CONTRACT/);
  });

  test('first-turn writes (counterpart missing) stay silent', () => {
    const r = run('write_file', {
      path: 'timeline.js',
      content: `document.getElementById('anything');\n`
    });
    assert.doesNotMatch(r.content, /CROSS-FILE|AUTO-CORRECTED/);
  });

  test('edit_file auto-corrects a newly introduced near-miss', () => {
    write('index.html', `<div id="stage"></div>\n`);
    run('write_file', { path: 'timeline.js', content: `const s = document.getElementById('stage');\n` });
    const r = run('edit_file', {
      path: 'timeline.js',
      old_string: `const s = document.getElementById('stage');`,
      new_string: `const s = document.getElementById('stag-e');`
    });
    assert.match(r.content, /AUTO-CORRECTED/);
    assert.match(read('timeline.js'), /getElementById\('stage'\)/);
  });

  test('css writes never trigger the contract check', () => {
    write('index.html', `<div id="x"></div>`);
    const r = run('write_file', { path: 'style.css', content: `.x { color: red; }\n` });
    assert.doesNotMatch(r.content, /CROSS-FILE|AUTO-CORRECTED/);
  });
});

describe('grep_files glob and context', () => {
  beforeEach(() => {
    write('style.css', `.card { color: red; }\n.card-title { color: blue; }\n`);
    write('timeline.js', `function seek(t) {\n  // move the playhead\n  el.style.opacity = t;\n}\n`);
  });

  test('glob filters which files are searched', () => {
    const r = run('grep_files', { pattern: 'card', glob: '*.css' });
    assert.equal(r.meta.count, 2);
    assert.match(r.content, /style\.css/);
    assert.doesNotMatch(r.content, /timeline\.js/);
  });

  test('context shows surrounding lines, matches marked with >', () => {
    const r = run('grep_files', { pattern: 'playhead', context: 1 });
    assert.equal(r.meta.count, 1);
    assert.match(r.content, /seek\(t\)/);
    assert.match(r.content, />.*playhead/);
    assert.match(r.content, /opacity/);
  });

  test('no context keeps the old one-line-per-match shape', () => {
    const r = run('grep_files', { pattern: 'color' });
    assert.equal(r.meta.count, 2);
    assert.match(r.content, /^style\.css:1:/m);
    assert.doesNotMatch(r.content, />/);
  });
});
