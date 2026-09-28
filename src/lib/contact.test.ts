import { describe, expect, it } from 'vitest';
import {
  contactEmailText,
  contactSubject,
  contactTopicIds,
  honeypotField,
  isHoneypotFilled,
  maxMessageLength,
  sanitizeHeaderValue,
  validateContactRequest,
} from './contact';

const valid = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  organization: 'Example LAN',
  topic: 'quote',
  numServers: '50',
  eventDates: '2027-01-01 to 2027-01-03',
  message: 'We are planning a 50-server event, what would that cost?',
};

describe('validateContactRequest', () => {
  it('accepts a fully filled request', () => {
    const result = validateContactRequest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com', topic: 'quote' });
  });

  it('accepts the minimal required fields', () => {
    const result = validateContactRequest({ name: 'A', email: 'a@b.com', topic: 'other', message: 'hi' });
    expect(result.ok).toBe(true);
  });

  it('rejects a missing or blank name', () => {
    expect(validateContactRequest({ ...valid, name: '' }).ok).toBe(false);
    expect(validateContactRequest({ ...valid, name: '   ' }).ok).toBe(false);
    const { name, ...rest } = valid;
    void name;
    expect(validateContactRequest(rest).ok).toBe(false);
  });

  it('rejects an invalid email', () => {
    for (const email of ['', 'not-an-email', 'a@b', 'a b@example.com', 'a@example.com\r\nBcc: x@y.com']) {
      expect(validateContactRequest({ ...valid, email }).ok).toBe(false);
    }
  });

  it('rejects an unknown or missing topic', () => {
    expect(validateContactRequest({ ...valid, topic: 'unknown' }).ok).toBe(false);
    const { topic, ...rest } = valid;
    void topic;
    expect(validateContactRequest(rest).ok).toBe(false);
  });

  it('every declared topic id validates', () => {
    for (const topic of contactTopicIds) {
      expect(validateContactRequest({ ...valid, topic }).ok).toBe(true);
    }
  });

  it('rejects a missing message and one over the length limit', () => {
    expect(validateContactRequest({ ...valid, message: '' }).ok).toBe(false);
    expect(validateContactRequest({ ...valid, message: 'x'.repeat(maxMessageLength) }).ok).toBe(true);
    expect(validateContactRequest({ ...valid, message: 'x'.repeat(maxMessageLength + 1) }).ok).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(validateContactRequest(null).ok).toBe(false);
    expect(validateContactRequest('hi').ok).toBe(false);
    expect(validateContactRequest([]).ok).toBe(false);
  });

  it('organization, numServers and eventDates are optional', () => {
    const result = validateContactRequest({ ...valid, organization: undefined, numServers: undefined, eventDates: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ organization: '', numServers: '', eventDates: '' });
  });
});

describe('isHoneypotFilled', () => {
  it('is false when empty or missing', () => {
    expect(isHoneypotFilled({ ...valid })).toBe(false);
    expect(isHoneypotFilled({ ...valid, [honeypotField]: '' })).toBe(false);
    expect(isHoneypotFilled({ ...valid, [honeypotField]: '   ' })).toBe(false);
  });

  it('is true once a bot fills it in', () => {
    expect(isHoneypotFilled({ ...valid, [honeypotField]: 'http://spam.example' })).toBe(true);
  });

  it('is false for a non-object body', () => {
    expect(isHoneypotFilled(null)).toBe(false);
  });
});

describe('sanitizeHeaderValue', () => {
  it('strips CR and LF so a value can never add a header line', () => {
    expect(sanitizeHeaderValue('Jane\r\nBcc: attacker@evil.example')).toBe('Jane Bcc: attacker@evil.example');
    expect(sanitizeHeaderValue('line1\nline2\rline3')).toBe('line1 line2 line3');
  });

  it('strips other control characters and trims the result', () => {
    expect(sanitizeHeaderValue('  Jane\x00Doe\x1f  ')).toBe('Jane Doe');
  });

  it('leaves an ordinary value untouched', () => {
    expect(sanitizeHeaderValue('Jane Doe')).toBe('Jane Doe');
  });
});

describe('contactSubject', () => {
  it('builds "[Contact] <topic label> — <name>"', () => {
    expect(contactSubject({ topic: 'quote', name: 'Jane Doe' })).toBe('[Contact] More than 40 servers / custom quote — Jane Doe');
  });

  it('sanitizes and truncates an oversized or hostile name', () => {
    const subject = contactSubject({ topic: 'other', name: `x\r\nBcc: attacker@evil.example ${'y'.repeat(300)}` });
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(200);
  });
});

describe('contactEmailText', () => {
  it('lists every field, omitting the optional ones when blank', () => {
    const text = contactEmailText({ ...valid, topic: 'quote' } as never);
    expect(text).toContain('Name: Jane Doe');
    expect(text).toContain('Email: jane@example.com');
    expect(text).toContain('Organization: Example LAN');
    expect(text).toContain('Number of servers: 50');
    expect(text).toContain('Event dates: 2027-01-01 to 2027-01-03');
    expect(text).toContain(valid.message);

    const minimal = contactEmailText({ name: 'A', email: 'a@b.com', organization: '', topic: 'other', numServers: '', eventDates: '', message: 'hi' });
    expect(minimal).not.toContain('Organization:');
    expect(minimal).not.toContain('Number of servers:');
    expect(minimal).not.toContain('Event dates:');
  });
});
