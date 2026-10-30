/**
 * licence.mjs — licence gate shared by the v3 asset fetch/build scripts.
 *
 * Allowed sources (plan 09 decision 2, plan 10 §12): CC0, public domain,
 * CC BY 4.0 with attribution, own work, plus the two open-data licences this
 * repo already ships under (Copernicus DEM, Copernicus Sentinel data), which
 * are free and need only an attribution notice, and SIL OFL 1.1 for fonts. NC, ND, SA-only-with-NC,
 * "editorial", "research or evaluation only" and anything unknown are refused.
 *
 * Every fetch script calls assertLicence() before it writes an asset, and
 * checkLicencePage() where the licence is stated on a web page, so a source
 * that changes its terms stops the pipeline instead of slipping through.
 */

export const ALLOWED = {
  'CC0 1.0': /\bCC0\b/i,
  'Public domain': /public domain/i,
  'CC BY 4.0': /\bCC[ -]BY 4\.0\b/i,
  'Copernicus Sentinel data licence': /Copernicus Sentinel data licen[cs]e|Sentinel[_ ]Data[_ ]Legal[_ ]Notice/i,
  'Copernicus DEM licence': /COP-DEM|Copernicus DEM/i,
  'SIL OFL 1.1': /\bSIL OFL 1\.1\b/i, // fonts (plan 10 §3)
};

const REFUSED = /\b(NC|ND|non-?commercial|no ?derivatives|editorial|research or evaluation)\b/i;

/**
 * Throw unless `licence` names an allowed licence and nothing refused.
 * @param {string} assetId
 * @param {string} licence licence string as recorded in the manifest
 * @returns {string} the canonical allowed licence name
 */
export function assertLicence(assetId, licence) {
  if (!licence || REFUSED.test(licence)) {
    throw new Error(`licence check: ${assetId} has refused or missing licence "${licence}"`);
  }
  const hit = Object.keys(ALLOWED).find((k) => ALLOWED[k].test(licence) || k === licence);
  if (!hit) throw new Error(`licence check: ${assetId} licence "${licence}" is not on the allowed list`);
  return hit;
}

/**
 * Fetch a licence page and require a phrase on it (for sources whose API does
 * not return a licence field, such as Poly Haven, whose whole library is CC0).
 * @param {string} url
 * @param {RegExp} mustMatch
 */
export async function checkLicencePage(url, mustMatch) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ImmersiveLearningPortfolio/3.0 (licence check)' } });
  if (!res.ok) throw new Error(`licence check: HTTP ${res.status} for ${url}`);
  const text = await res.text();
  if (!mustMatch.test(text)) throw new Error(`licence check: ${url} no longer states ${mustMatch}`);
  return true;
}
