/**
 * Cross-file contract audit tests.
 *
 * auditIdClassContracts is the shared static auditor behind the write-time feedback in
 * write_file/edit_file, check_composition, and diagnose_issue. Its whole job is to catch
 * the "model writes index.html with id=playbtn, then queries #play-btn" class of bug at
 * write time instead of three debug turns later — so these tests pin exactly that.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { auditIdClassContracts, contractReport, repairIdClassContracts, manifestOf } from '../src/agent/tools/contract-audit.js';

let dir;

const write = (name, content) => fs.writeFileSync(path.join(dir, name), content, 'utf-8');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf-8');
const findingsFor = (entry = 'index.html') => auditIdClassContracts(dir, entry).findings;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anymotion-contract-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('auditIdClassContracts', () => {
  test('reports the id mismatch with file:line and the correction', () => {
    write('index.html', `<div id="playbtn"></div>`);
    write('timeline.js', `const btn = document.getElementById('play-btn');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.match(f[0], /timeline\.js:1/);
    assert.match(f[0], /getElementById\('play-btn'\)/);
    assert.match(f[0], /id="playbtn"/);
  });

  test('reports the class mismatch when the JS queries an absent class', () => {
    write('index.html', `<div class="card_item"></div>`);
    write('timeline.js', `document.querySelectorAll('.card-item');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.match(f[0], /\.card-item/);
    assert.match(f[0], /It has class="card_item"/);
  });

  test('clean project produces no findings', () => {
    write('index.html', `<div id="stage"><div class="card" data-scene="1"></div></div>`);
    write('timeline.js', `
      const stage = document.getElementById('stage');
      const cards = document.querySelectorAll('.card');
      const s1 = document.querySelector('[data-scene="1"]');
    `);
    assert.deepEqual(findingsFor(), []);
  });

  test('runtime-toggled classes do not count as mismatches', () => {
    write('index.html', `<div id="x"></div>`);
    write('timeline.js', `document.querySelectorAll('.scene');\ndocument.querySelector('.active');\n`);
    assert.deepEqual(findingsFor(), []);
  });

  test('compound selectors are decomposed — id and class checked separately', () => {
    write('index.html', `<div class="card"></div>`);
    write('timeline.js', `document.querySelector('.card #header');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.match(f[0], /#header/);
  });

  test('data-scene mismatch lists the scenes that do exist', () => {
    write('index.html', `<div data-scene="1"></div><div data-scene="2"></div>`);
    write('timeline.js', `document.querySelector('[data-scene="3"]');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.match(f[0], /scenes: 1, 2/);
  });

  test('skips silently when the HTML does not exist yet', () => {
    write('timeline.js', `document.getElementById('x');\n`);
    assert.deepEqual(auditIdClassContracts(dir, 'index.html'), { findings: [], skipped: 'html' });
  });

  test('skips silently when no JS exists yet', () => {
    write('index.html', `<div id="x"></div>`);
    assert.deepEqual(auditIdClassContracts(dir, 'index.html'), { findings: [], skipped: 'js' });
  });

  test('scans every root .js file, not just timeline.js', () => {
    write('index.html', `<div id="a"></div>`);
    write('main.js', `document.getElementById('b');\n`);
    assert.equal(findingsFor().length, 1);
  });

  test('getElementsByClassName is covered too', () => {
    write('index.html', `<div class="hero_dot"></div>`);
    write('timeline.js', `document.getElementsByClassName('hero-dot');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.match(f[0], /getElementsByClassName\('hero-dot'\)/);
    assert.match(f[0], /It has class="hero_dot"/);
  });

  test('fuzzy match ignores - and _ in both directions', () => {
    write('index.html', `<div class="hero_title"></div>`);
    write('timeline.js', `document.querySelector('.hero-title');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.match(f[0], /class="hero_title"/);
  });

  test('no near-miss means a plain missing report without a suggestion', () => {
    write('index.html', `<div id="stage"></div>`);
    write('timeline.js', `document.getElementById('zebra');\n`);
    const f = findingsFor();
    assert.equal(f.length, 1);
    assert.doesNotMatch(f[0], /It has/);
  });

  test('elements the JS builds itself are not mismatches', () => {
    write('index.html', `<div id="stage"></div>`);
    write('timeline.js', `
      const d = document.createElement('div');
      d.id = 'overlay';
      d.className = 'overlay-glass';
      document.getElementById('stage').appendChild(d);
      document.querySelector('#overlay').addEventListener('click', () => {});
      document.querySelector('.overlay-glass').style.opacity = 1;
    `);
    assert.deepEqual(findingsFor(), []);
  });
});

describe('contractReport', () => {
  test('renders numbered findings with the fix-now header', () => {
    write('index.html', `<div id="playbtn"></div>`);
    write('timeline.js', `document.getElementById('zebra');\n`);
    const r = contractReport(dir);
    assert.match(r, /CROSS-FILE MISMATCHES/);
    assert.match(r, /1\./);
    assert.match(r, /zebra/);
  });

  test('empty for a clean or half-built project', () => {
    assert.equal(contractReport(dir), '');
    write('index.html', `<div id="x"></div>`);
    assert.equal(contractReport(dir), '');
  });
});

describe('repairIdClassContracts', () => {
  test('corrects unambiguous near-misses across all reference forms', () => {
    write('index.html', `<div id="playbtn" class="hero_dot" data-scene="1"></div>`);
    write('timeline.js', [
      `const btn = document.getElementById('play-btn');`,
      `const dots = document.querySelectorAll('.hero-dot');`,
      `const byClass = document.getElementsByClassName('hero-dot');`,
      `const viaQuery = document.querySelector('#play-btn');`,
      `const scene = document.querySelector('[data-scene="1"]');`
    ].join('\n'));
    const { repaired, rewritten } = repairIdClassContracts(dir);
    assert.ok(rewritten.has('timeline.js'));
    const out = rewritten.get('timeline.js');
    assert.match(out, /getElementById\('playbtn'\)/);
    assert.match(out, /querySelectorAll\('\.hero_dot'\)/);
    assert.match(out, /getElementsByClassName\('hero_dot'\)/);
    assert.match(out, /querySelector\('#playbtn'\)/);
    // The repaired bytes are what is on disk.
    assert.equal(out, read('timeline.js'));
    assert.equal(repaired.length, 4);
  });

  test('leaves references with no candidate completely untouched', () => {
    write('index.html', `<div id="stage"></div>`);
    const src = `document.getElementById('zebra');\n`;
    write('timeline.js', src);
    const { repaired, rewritten } = repairIdClassContracts(dir);
    assert.deepEqual(repaired, []);
    assert.equal(rewritten.size, 0);
    assert.equal(read('timeline.js'), src);
  });

  test('repair clears the findings it fixed — audit agrees afterwards', () => {
    write('index.html', `<div id="playbtn"></div>`);
    write('timeline.js', `document.getElementById('play-btn');\n`);
    repairIdClassContracts(dir);
    assert.deepEqual(auditIdClassContracts(dir).findings, []);
  });

  test('no-op on a half-built project', () => {
    write('timeline.js', `document.getElementById('x');\n`);
    assert.deepEqual(repairIdClassContracts(dir), { repaired: [], rewritten: new Map() });
  });
});

describe('manifestOf', () => {
  test('lists ids, classes and scenes with counts', () => {
    write('index.html', `<div id="a" class="x y" data-scene="1"></div><div id="b" data-scene="2"></div>`);
    const m = manifestOf(path.join(dir, 'index.html'));
    assert.match(m, /NAMING CONTRACT/);
    assert.match(m, /ids \(2\): a, b/);
    assert.match(m, /classes \(2\): x, y/);
    assert.match(m, /data-scene values \(2\): 1, 2/);
  });

  test('empty for a missing file or one with no names', () => {
    assert.equal(manifestOf(path.join(dir, 'nope.html')), '');
    write('plain.html', `<p>text</p>`);
    assert.equal(manifestOf(path.join(dir, 'plain.html')), '');
  });
});
