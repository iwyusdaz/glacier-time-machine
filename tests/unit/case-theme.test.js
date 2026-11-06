/**
 * Case theme (design/art-bible.md §2, §4): the v3 text/surface pairs in
 * src/styles/case-fonts.css are >= 4.5:1, the two faces (Playfair Display,
 * Atkinson Hyperlegible) are self-hosted and Plain font switches both roles,
 * and main.js loads the case CSS after the v3 shell.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync('src/styles/case-fonts.css', 'utf8');
const token = (name, block = css) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
describe('glacier case theme', () => {
  it('v3 text pairs are >= 4.5:1 on the solid surface', () => {
    const surface = token('--v3-surface-solid');
    for (const fg of ['--v3-text', '--v3-muted', '--v3-accent', '--v3-ok', '--v3-err', '--v3-focus']) {
      expect(contrast(token(fg), surface), fg).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(token('--v3-accent-ink'), token('--v3-accent'))).toBeGreaterThanOrEqual(4.5);
  });
  it('fonts are self-hosted WOFF2 and Plain font overrides both roles', () => {
    const urls = [...css.matchAll(/url\('\.\/(fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(4);
    for (const u of urls) {
      expect(existsSync(`src/styles/${u}`), u).toBe(true);
      expect(statSync(`src/styles/${u}`).size).toBeLessThan(60 * 1024);
    }
    expect(css).not.toMatch(/https?:\/\//);
    for (const fam of ['Playfair Display', 'Atkinson Hyperlegible']) expect(css).toContain(`font-family: '${fam}'`);
    expect(css).not.toMatch(/'Inter'/);
    expect(existsSync('src/styles/fonts/LICENSE-AtkinsonHyperlegible.txt')).toBe(true);
    const plain = css.slice(css.lastIndexOf(':root[data-plain-font="on"]'));
    for (const role of ['--font-display', '--font-body']) expect(plain).toContain(role);
    expect(plain).not.toMatch(/Playfair|Atkinson/);
  });
  it('main.js loads the case CSS after the v3 shell, and the nav CSS last', () => {
    const main = readFileSync('src/main.js', 'utf8');
    const at = (f) => main.indexOf(`'./${f}'`);
    expect(at('v3/shell.css')).toBeGreaterThan(0);
    expect(at('styles/case-fonts.css')).toBeGreaterThan(at('v3/shell.css'));
    expect(at('styles/glacier-nav.css')).toBeGreaterThan(at('styles/glacier-v3.css'));
  });
});
