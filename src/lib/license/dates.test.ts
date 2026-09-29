import { describe, expect, it } from 'vitest';
import { eventDatesValue, isIsoDay } from './dates';
import { checkoutValidityText } from './describe';
import { licenseDates, parseEventDates } from './format';

describe('checkout start date → eventdates metadata', () => {
  it('event: the 5-day window; yearly and founder: the start day', () => {
    expect(eventDatesValue('event', '2026-10-03')).toBe('2026-10-03/2026-10-07');
    expect(eventDatesValue('year', '2026-10-03')).toBe('2026-10-03');
    expect(eventDatesValue('founder', '2026-10-03')).toBe('2026-10-03');
  });
  it('rolls over months and years', () => {
    expect(eventDatesValue('event', '2026-10-30')).toBe('2026-10-30/2026-11-03');
    expect(eventDatesValue('event', '2026-12-30')).toBe('2026-12-30/2027-01-03');
    expect(eventDatesValue('event', '2028-02-27')).toBe('2028-02-27/2028-03-02');
  });
  it('isIsoDay accepts real days only', () => {
    expect(isIsoDay('2026-10-03')).toBe(true);
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('3 Oct 2026')).toBe(false);
  });
});

describe('checkoutValidityText', () => {
  it('event, yearly, founder', () => {
    expect(checkoutValidityText('event', '2026-10-03')).toBe('Valid 3–7 October 2026 (5 days)');
    expect(checkoutValidityText('year', '2026-10-03')).toBe('Valid 3 October 2026 – 2 October 2027');
    expect(checkoutValidityText('founder', '2026-10-03')).toBe('Starts 3 October 2026. Updates for life.');
  });
  it('month and year rollover', () => {
    expect(checkoutValidityText('event', '2026-10-30')).toBe('Valid 30 October – 3 November 2026 (5 days)');
    expect(checkoutValidityText('event', '2026-12-30')).toBe('Valid 30 December 2026 – 3 January 2027 (5 days)');
    expect(checkoutValidityText('year', '2027-01-01')).toBe('Valid 1 January – 31 December 2027');
  });
});

describe('license issuing from the ISO eventdates', () => {
  const purchase = '2026-09-29';
  it('parses the picker values', () => {
    expect(parseEventDates('2026-10-03/2026-10-07')).toEqual({ start: '2026-10-03', end: '2026-10-07' });
    expect(parseEventDates('2026-10-03')).toEqual({ start: '2026-10-03', end: '2026-10-03' });
  });
  it('event: valid_from/valid_to from the window, across a month and a year', () => {
    expect(licenseDates('event', purchase, '2026-10-03/2026-10-07')).toEqual({ updates_until: '2026-10-07', valid_from: '2026-10-03', valid_to: '2026-10-07', fromForm: true });
    expect(licenseDates('event', purchase, '2026-10-30/2026-11-03')).toMatchObject({ valid_from: '2026-10-30', valid_to: '2026-11-03' });
    expect(licenseDates('event', '2026-12-20', '2026-12-30/2027-01-03')).toMatchObject({ valid_from: '2026-12-30', valid_to: '2027-01-03' });
  });
  it('event: a window longer than 5 days is capped', () => {
    expect(licenseDates('event', purchase, '2026-10-03/2026-10-20')).toMatchObject({ valid_from: '2026-10-03', valid_to: '2026-10-07' });
  });
  it('yearly: updates for 12 months from the chosen start; founder: lifetime', () => {
    expect(licenseDates('year', purchase, '2026-10-03')).toEqual({ updates_until: '2027-10-03', fromForm: true });
    expect(licenseDates('year', '2026-12-15', '2026-12-31')).toEqual({ updates_until: '2027-12-31', fromForm: true });
    expect(licenseDates('year', purchase, undefined)).toEqual({ updates_until: '2027-09-29', fromForm: false });
    expect(licenseDates('founder', purchase, '2026-10-03')).toEqual({ updates_until: '9999-12-31', fromForm: false });
  });
  it('old free text still works', () => {
    expect(licenseDates('event', purchase, '3-5 October 2026')).toMatchObject({ valid_from: '2026-10-03', valid_to: '2026-10-05', fromForm: true });
    expect(licenseDates('event', purchase, 'October 30 – November 2, 2026')).toMatchObject({ fromForm: expect.any(Boolean) });
    expect(parseEventDates('3.10.2026')).toEqual({ start: '2026-10-03', end: '2026-10-03' });
  });
  it('an implausible or broken ISO value falls back', () => {
    expect(licenseDates('event', purchase, '2031-01-01/2031-01-05')).toMatchObject({ valid_from: purchase, fromForm: false });
    expect(parseEventDates('2026-02-30/2026-03-02')).toEqual({ start: '2026-03-02', end: '2026-03-02' });
  });
});
