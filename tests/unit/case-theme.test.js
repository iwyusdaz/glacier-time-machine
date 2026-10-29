/**
 * Case theme (design/art-bible.md §2): every HUD text/background pair in
 * src/styles/case-hud.css is >= 4.5:1, the fonts are self-hosted and the
 * Plain-font override switches all three roles.
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

const css = readFileSync('src/styles/case-hud.css', 'utf8');
const token = (name, block = css) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];

describe('glacier case theme', () => {
  it('dark theme text pairs are >= 4.5:1', () => {
    const surface = token('--surface');
    for (const fg of ['--text', '--muted', '--accent', '--v2-text', '--v2-accent']) {
      expect(contrast(token(fg), surface), fg).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(token('--text'), token('--bg'))).toBeGreaterThanOrEqual(4.5);
    // white on the active module tab (deep ice)
    expect(contrast('#ffffff', token('--accent-strong'))).toBeGreaterThanOrEqual(4.5);
  });

  it('light theme text pairs are >= 4.5:1', () => {
    const light = css.slice(css.indexOf('prefers-color-scheme: light'), css.indexOf(':root[data-contrast'));
    const surface = token('--surface', light);
    for (const fg of ['--text', '--muted', '--accent']) {
      expect(contrast(token(fg, light), surface), fg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('art-bible palette pairs used for text on slate pass', () => {
    expect(contrast('#edf5fa', '#3f4a52')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#7fb7d6', '#0f1924')).toBeGreaterThanOrEqual(4.5);
  });

  it('fonts are self-hosted WOFF2 and Plain font overrides every role', () => {
    const fonts = readFileSync('src/styles/case-fonts.css', 'utf8');
    const urls = [...fonts.matchAll(/url\('\.\/(fonts\/[^']+\.woff2)'\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(6);
    for (const u of urls) {
      expect(existsSync(`src/styles/${u}`), u).toBe(true);
      expect(statSync(`src/styles/${u}`).size).toBeLessThan(60 * 1024);
    }
    expect(fonts).not.toMatch(/https?:\/\//);
    for (const fam of ['Playfair Display', 'Inter', 'JetBrains Mono']) expect(fonts).toContain(`font-family: '${fam}'`);
    const plain = fonts.slice(fonts.lastIndexOf('html[data-plain-font="on"]'));
    for (const role of ['--font-display', '--font-body', '--font-accent']) {
      expect(plain).toContain(role);
    }
    expect(plain).not.toMatch(/Playfair|Inter'|JetBrains/);
  });

  it('main.js loads the case CSS after the shared HUD shell', () => {
    const main = readFileSync('src/main.js', 'utf8');
    expect(main.indexOf("'./v2/hud-shell.css'")).toBeGreaterThan(0);
    expect(main.indexOf("'./styles/case-hud.css'")).toBeGreaterThan(main.indexOf("'./v2/hud-shell.css'"));
  });
});
