#!/usr/bin/env node
/**
 * build-sources.mjs — generates public/sources.html from research/sources.md.
 *
 * Review T1/G2 (expert-style + heuristics H2): in-app citations said
 * "Source: research/sources.md row N", but research/ is not shipped, so the
 * evidence chain was unreachable in-app. This script ships a compact register
 * (row number anchors `#row-N`) so every in-app citation resolves: src/ui/dom.js
 * links row numbers to ./sources.html#row-N.
 *
 * The generated file is committed (like public/attribution.json) and rebuilt on
 * every build/dev run so it cannot drift from the markdown silently.
 *
 * Run: node scripts/build-sources.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const md = readFileSync('research/sources.md', 'utf8');
const rows = [];
let lastProseUrl = '';
for (const line of md.split('\n')) {
  // Remember prose URLs (some sections state their source page outside the table).
  const prose = line.match(/https?:\/\/[^\s)>]+/);
  if (prose && !line.trim().startsWith('|')) lastProseUrl = prose[0];
  // 4-cell rows: | # | Claim | Source URL | Status |
  let m = line.match(/^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/);
  if (m && /^https?:|^\u2014$|^-$/.test(m[3])) {
    rows.push({ num: Number(m[1]), claim: m[2], url: m[3].trim(), status: m[4] });
    continue;
  }
  // 3-cell rows: | # | Claim | Status | (URL comes from the section's prose)
  m = line.match(/^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/);
  if (m) rows.push({ num: Number(m[1]), claim: m[2], url: lastProseUrl, status: m[3] });
}
if (rows.length < 10) {
  console.error(`sources: expected >= 10 rows in research/sources.md, parsed ${rows.length}`);
  process.exit(1);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Glacier Time Machine — source register</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5;
         max-width: 60rem; margin: 0 auto; padding: 1rem; color: #1a2028; background: #f5f6f8; }
  h1 { font-size: 1.3rem; }
  table { border-collapse: collapse; width: 100%; background: #fff; }
  th, td { border: 1px solid #c8ced6; padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; font-size: 0.9rem; }
  th { background: #eef1f4; }
  td:first-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
  code { background: #eef1f4; padding: 0 0.25rem; border-radius: 4px; }
  p.note { font-size: 0.9rem; color: #4c5666; }
</style>
</head>
<body>
<h1>Source register</h1>
<p class="note">Every factual claim used in the Glacier Time Machine course, with the page it was
verified on (access date for all rows: 2026-10-27). This page is generated from
<code>research/sources.md</code> in the project repository; the in-app citations ("Source: row N")
link here. Status meanings: VERIFIED = read on the cited page; UNVERIFIED = not presented as fact
in the course; CONFLICT = sources disagree, presented with the conflict or not at all.</p>
<table>
<caption class="visually-hidden">Numbered source rows with claim, source page and verification status</caption>
<thead><tr><th scope="col">Row</th><th scope="col">Claim</th><th scope="col">Source</th><th scope="col">Status</th></tr></thead>
<tbody>
${rows.map((r) => `<tr id="row-${r.num}"><td>${r.num}</td><td>${r.claim}</td><td>${r.url ? `<a href="${esc(r.url)}" rel="noopener">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 80))}${r.url.replace(/^https?:\/\//, '').length > 80 ? '…' : ''}</a>` : ''}</td><td>${esc(r.status)}</td></tr>`).join('\n')}
</tbody>
</table>
<p class="note"><a href="./">Back to the course</a></p>
</body>
</html>
`;
writeFileSync('public/sources.html', html);
console.log(`public/sources.html: ${rows.length} source rows`);
