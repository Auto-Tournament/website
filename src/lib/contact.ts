/**
 * Pure logic for the /contact form and POST /api/contact: the topics shown in
 * the form, request validation, and the outgoing email's subject/body. No
 * Next import and no process.env, so it is easy to test.
 *
 * Relative import on purpose: vitest runs this file without the `@/` alias.
 */

export const contactTopics = [
  { id: 'license', label: 'License question' },
  { id: 'quote', label: 'More than 40 servers / custom quote' },
  { id: 'free-lan', label: 'Free LAN confirmation' },
  { id: 'invoice', label: 'Pay by bank transfer / invoice' },
  { id: 'other', label: 'Something else' },
] as const;

export type ContactTopic = (typeof contactTopics)[number]['id'];
export const contactTopicIds = contactTopics.map((t) => t.id) as ContactTopic[];

/** Topics that ask for the optional "number of servers" / "event dates" fields. */
export const contactTopicsWithEventDetails: readonly ContactTopic[] = ['quote', 'free-lan', 'invoice'];

export function contactTopicLabel(topic: ContactTopic): string {
  return contactTopics.find((t) => t.id === topic)?.label ?? topic;
}

/** The hidden honeypot field's name. A filled one is a bot; the route pretends success. */
export const honeypotField = 'website';

export const maxBodyBytes = 16 * 1024;
export const maxNameLength = 200;
export const maxOrgLength = 200;
export const maxEmailLength = 320;
export const maxDetailLength = 200;
export const maxMessageLength = 5000;

const isString = (v: unknown): v is string => typeof v === 'string';

/** Strict enough for a contact address: no whitespace (so no CR/LF either), one @, reasonable length. */
const emailPattern = /^[^\s@]{1,200}@[^\s@]{1,200}\.[^\s@]{1,63}$/;

export type ContactRequest = {
  name: string;
  email: string;
  organization: string;
  topic: ContactTopic;
  numServers: string;
  eventDates: string;
  message: string;
};

export type Validation = { ok: true; value: ContactRequest } | { ok: false; error: string };

/** Removes CR/LF (and other control characters) so a value can never inject an extra header line. */
export function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]+/g, ' ').trim();
}

/** Collapses whitespace and caps length after trimming. */
function cleanString(value: unknown, maxLength: number): string {
  if (!isString(value)) return '';
  return sanitizeHeaderValue(value).slice(0, maxLength);
}

export function validateContactRequest(body: unknown): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Expected a JSON object.');
  const obj = body as Record<string, unknown>;

  const name = cleanString(obj.name, maxNameLength);
  if (!name) return fail('Enter your name.');

  const rawEmail = isString(obj.email) ? obj.email.trim() : '';
  if (!rawEmail || rawEmail.length > maxEmailLength || !emailPattern.test(rawEmail)) return fail('Enter a valid email address.');

  const organization = cleanString(obj.organization, maxOrgLength);

  if (!isString(obj.topic) || !(contactTopicIds as string[]).includes(obj.topic)) return fail('Choose a topic.');
  const topic = obj.topic as ContactTopic;

  const numServers = cleanString(obj.numServers, maxDetailLength);
  const eventDates = cleanString(obj.eventDates, maxDetailLength);

  const rawMessage = isString(obj.message) ? obj.message.trim() : '';
  if (!rawMessage) return fail('Enter a message.');
  if (rawMessage.length > maxMessageLength) return fail(`Message must be ${maxMessageLength} characters or fewer.`);

  return {
    ok: true,
    value: { name, email: rawEmail, organization, topic, numServers, eventDates, message: rawMessage },
  };
}

/** True when the honeypot field was filled in: a bot, not a visitor. Caller should pretend success. */
export function isHoneypotFilled(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const value = (body as Record<string, unknown>)[honeypotField];
  return isString(value) && value.trim().length > 0;
}

const maxSubjectLength = 200;

/** "[Contact] License question — Jane Doe", sanitized and truncated. */
export function contactSubject(req: Pick<ContactRequest, 'topic' | 'name'>): string {
  const subject = `[Contact] ${contactTopicLabel(req.topic)} — ${req.name}`;
  return sanitizeHeaderValue(subject).slice(0, maxSubjectLength);
}

/** Plain-text body listing every field, in order. */
export function contactEmailText(req: ContactRequest): string {
  const lines = [
    `Name: ${req.name}`,
    `Email: ${req.email}`,
    ...(req.organization ? [`Organization: ${req.organization}`] : []),
    `Topic: ${contactTopicLabel(req.topic)}`,
    ...(req.numServers ? [`Number of servers: ${req.numServers}`] : []),
    ...(req.eventDates ? [`Event dates: ${req.eventDates}`] : []),
    '',
    'Message:',
    req.message,
  ];
  return lines.join('\n');
}
