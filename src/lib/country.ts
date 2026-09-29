/**
 * The checkout's billing countries and the country to preselect: Cloudflare's
 * CF-IPCountry header (read server-side), else the region in the browser's
 * language setting ("nb-NO" → NO), else none ("Choose your country").
 * Pure, no Next import.
 */

// ISO 3166-1 alpha-2; names come from Intl.DisplayNames (English).
export const countryCodes =
  'AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CV CY CZ DE DJ DK DM DO DZ EC EE EG ES ET FI FJ FO FR GA GB GD GE GG GH GI GL GM GN GR GT GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP KE KG KH KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV MA MC MD ME MG MK ML MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PT PY QA RE RO RS RW SA SC SE SG SI SK SL SM SN SR SV TD TG TH TJ TN TR TT TW TZ UA UG US UY UZ VA VC VE VG VN XK ZA ZM ZW'.split(
    ' ',
  );

const known = new Set(countryCodes);

/** A code we sell to, upper-cased, or null. */
function listed(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && known.has(c) ? c : null;
}

/**
 * Cloudflare's CF-IPCountry value as a country to preselect. XX (unknown)
 * and T1 (Tor) are not countries; neither is anything we don't list.
 */
export function countryFromHeader(value: string | null | undefined): string | null {
  const c = (value ?? '').trim().toUpperCase();
  if (c === 'XX' || c === 'T1') return null;
  return listed(c);
}

/** The first listed region in the browser's languages: ["nb-NO", "en"] → NO. */
export function countryFromLocales(locales: readonly string[] | null | undefined): string | null {
  for (const tag of locales ?? []) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(tag).region;
    } catch {
      region = /^[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(tag)?.[1];
    }
    const c = listed(region);
    if (c) return c;
  }
  return null;
}

/** The header's country, else the browser's, else '' (no preselection). */
export function initialCountry(header: string | null | undefined, locales: readonly string[] | null | undefined): string {
  return listed(header) ?? countryFromLocales(locales) ?? '';
}
