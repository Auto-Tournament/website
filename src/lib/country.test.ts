import { describe, expect, it } from 'vitest';
import { countryFromHeader, countryFromLocales, initialCountry } from './country';

describe('checkout country prefill', () => {
  it('CF-IPCountry: listed countries, any case; XX and T1 ignored', () => {
    expect(countryFromHeader('NO')).toBe('NO');
    expect(countryFromHeader(' de ')).toBe('DE');
    expect(countryFromHeader('XX')).toBeNull();
    expect(countryFromHeader('T1')).toBeNull();
    expect(countryFromHeader('')).toBeNull();
    expect(countryFromHeader(null)).toBeNull();
    expect(countryFromHeader('ZZ')).toBeNull();
    expect(countryFromHeader('NOR')).toBeNull();
  });
  it('browser locale region as the fallback', () => {
    expect(countryFromLocales(['nb-NO', 'en'])).toBe('NO');
    expect(countryFromLocales(['en', 'sv-SE'])).toBe('SE');
    expect(countryFromLocales(['en'])).toBeNull();
    expect(countryFromLocales(['es-419'])).toBeNull();
    expect(countryFromLocales([])).toBeNull();
  });
  it('header first, then locale, else no preselection', () => {
    expect(initialCountry('SE', ['nb-NO'])).toBe('SE');
    expect(initialCountry(null, ['nb-NO'])).toBe('NO');
    expect(initialCountry('XX', ['en-GB'])).toBe('GB');
    expect(initialCountry(null, ['en'])).toBe('');
  });
});
