'use client';

/*
 * Hallmark · component: form (custom checkout) · genre: modern-minimal · theme: Auto Tournament system (tokens.ts)
 * states: default · hover · focus · active · disabled · loading (processing) · error (inline + form) · success (Stripe opens the thanks page)
 * contrast: pass (ink / ink2 / muted on paper2, ban on paper)
 */

/**
 * Our own checkout form: the buyer, the event, billing address, VAT ID,
 * promo code, the business confirmation and the terms, with Stripe's Payment
 * Element (card, wallets, 3-D Secure) as one block inside it. It doesn't talk
 * to Stripe itself: a `CheckoutAdapter` does (StripeCheckoutForm.tsx for the
 * real thing, a mock in the /dev/checkout preview).
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight';
import { Check } from '@phosphor-icons/react/dist/csr/Check';
import { LockSimple } from '@phosphor-icons/react/dist/csr/LockSimple';
import { WarningCircle } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { formatEuro, periodLabels, vatShort, type Period } from '@/components/pricing';
import { detailLimits, validateCheckoutDetails, type CheckoutDetails } from '@/lib/checkout';

const { color, radius } = tokens;

export type CheckoutAddress = { country: string; line1: string; line2: string; postal_code: string; city: string };

/** Everything the buyer typed, handed to the adapter on Pay. */
export type PayInput = Omit<CheckoutDetails, 'sessionId'> & { email: string; address: CheckoutAddress };

export type FieldKey = 'email' | 'company' | 'eventName' | 'eventDates' | 'vatId' | 'business' | 'terms' | 'country' | 'line1' | 'postal_code' | 'city' | 'promo';

export type PayResult = { ok: true } | { ok: false; error: string; field?: FieldKey };

/** Stripe's numbers for the order, in minor units (cents). */
export type CheckoutSummary = {
  sessionId: string;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  /** The promotion code applied, if any. */
  promotionCode: string | null;
  /** Set when the session already has the buyer's email (signed in on the console): shown, not asked. */
  email: string | null;
};

export type CheckoutAdapter = {
  summary: CheckoutSummary;
  applyPromotionCode: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  removePromotionCode: () => Promise<void>;
  /** Saves our fields, then confirms with Stripe. On success Stripe.js leaves for the thanks page. */
  pay: (input: PayInput) => Promise<PayResult>;
  /** Stripe's Payment Element (or the preview's stand-in). */
  payment: ReactNode;
};

export type CheckoutFormOrder = { packName: string; period: Period; maxServers?: number; servers: number };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Countries without postal codes where the field is left optional. */
const noPostalCode = new Set(['AE', 'AG', 'AO', 'BF', 'BJ', 'BS', 'BW', 'BZ', 'CM', 'FJ', 'GH', 'HK', 'IE', 'JM', 'KE', 'MO', 'QA', 'RW', 'TZ', 'UG', 'ZW']);

// ISO 3166-1 alpha-2; names come from Intl.DisplayNames in the buyer's language setting (English here).
const countryCodes =
  'AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CV CY CZ DE DJ DK DM DO DZ EC EE EG ES ET FI FJ FO FR GA GB GD GE GG GH GI GL GM GN GR GT GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP KE KG KH KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV MA MC MD ME MG MK ML MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PR PT PY QA RE RO RS RW SA SC SE SG SI SK SL SM SN SR SV TD TG TH TJ TN TR TT TW TZ UA UG US UY UZ VA VC VE VG VN XK ZA ZM ZW'.split(
    ' ',
  );

function countryOptions(): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  return countryCodes.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function formatMoney(minor: number, currency: string): string {
  if (currency.toLowerCase() === 'eur') return formatEuro(minor);
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);
}

type Values = {
  email: string;
  company: string;
  eventName: string;
  eventDates: string;
  vatId: string;
  business: boolean;
  terms: boolean;
  country: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
};

const empty: Values = {
  email: '',
  company: '',
  eventName: '',
  eventDates: '',
  vatId: '',
  business: false,
  terms: false,
  country: 'NO',
  line1: '',
  line2: '',
  postal_code: '',
  city: '',
};

type Errors = Partial<Record<FieldKey, string>>;

/** Our checks before anything goes to Stripe; the server checks the same details again. */
export function validateForm(values: Values, sessionId: string, emailFixed: boolean): Errors {
  const errors: Errors = {};
  if (!emailFixed && !emailPattern.test(values.email.trim())) errors.email = 'Enter the email address the license and invoice go to.';
  // Report every field at once, not only the first.
  const base = { sessionId, company: values.company, eventName: values.eventName, eventDates: values.eventDates, vatId: values.vatId, business: values.business, terms: values.terms };
  const fields = ['company', 'eventName', 'eventDates', 'vatId', 'business', 'terms'] as const;
  for (const field of fields) {
    const probe: Record<string, unknown> = { ...base };
    // Replace every other field with a valid value, so each error is this field's own.
    for (const other of fields) if (other !== field) probe[other] = validSample[other];
    const r = validateCheckoutDetails(probe);
    if (!r.ok && r.field === field) errors[field] = r.error;
  }
  if (!values.country) errors.country = 'Choose the country.';
  if (!values.line1.trim()) errors.line1 = 'Enter the street address.';
  if (!values.city.trim()) errors.city = 'Enter the city.';
  if (!values.postal_code.trim() && !noPostalCode.has(values.country)) errors.postal_code = 'Enter the postal code.';
  return errors;
}

const validSample = { company: 'Valid AS', eventName: 'Valid event', eventDates: '1 January 2027', vatId: '', business: true, terms: true } as const;

/* ------------------------------------------------------------------ fields */

const inputSx = {
  width: '100%',
  minHeight: 44,
  px: 1.5,
  py: 1.25,
  font: 'inherit',
  fontSize: '0.9375rem',
  color: color.ink,
  bgcolor: color.paper,
  border: `1px solid ${color.rule}`,
  borderRadius: `${radius.sm}px`,
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  '&::placeholder': { color: color.muted, opacity: 1 },
  '@media (hover: hover)': { '&:hover:not(:disabled)': { borderColor: color.muted } },
  '&:focus-visible': { borderColor: color.accent, boxShadow: `0 0 0 1px ${color.accent}` },
  '&[aria-invalid="true"]': { borderColor: color.ban },
  '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
} as const;

function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <Box id={id} sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', color: color.ban, fontSize: '0.8125rem', mt: 0.75 }}>
      <WarningCircle size={15} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
      <span>{children}</span>
    </Box>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const uid = useId();
  const id = `${uid}-${name}`;
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box component="label" htmlFor={id} sx={{ display: 'block', color: color.ink2, fontSize: '0.8125rem', fontWeight: 500, mb: 0.75 }}>
        {label}
      </Box>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && (
        <Box id={`${id}-hint`} sx={{ color: color.muted, fontSize: '0.8125rem', mt: 0.75 }}>
          {hint}
        </Box>
      )}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Box>
  );
}

function CheckRow({
  name,
  checked,
  onChange,
  error,
  disabled,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const uid = useId();
  const id = `${uid}-${name}`;
  return (
    <Box>
      <Box
        component="label"
        htmlFor={id}
        sx={{
          display: 'grid',
          gridTemplateColumns: '20px minmax(0, 1fr)',
          gap: 1.25,
          alignItems: 'start',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: color.ink,
          fontSize: '0.9375rem',
          lineHeight: 1.45,
        }}
      >
        <Box sx={{ position: 'relative', width: 20, height: 20, mt: '1px' }}>
          <Box
            component="input"
            type="checkbox"
            id={id}
            name={name}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            sx={{ position: 'absolute', inset: 0, m: 0, opacity: 0, cursor: 'inherit', '&:focus-visible + span': { outline: `2px solid ${color.focus}`, outlineOffset: 2 } }}
          />
          <Box
            component="span"
            aria-hidden
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 20,
              height: 20,
              borderRadius: '5px',
              border: `1px solid ${error ? color.ban : checked ? color.accent : color.muted}`,
              bgcolor: checked ? color.accent : color.paper,
              color: color.accentInk,
              transition: 'background-color 150ms, border-color 150ms',
              pointerEvents: 'none',
            }}
          >
            {checked && <Check size={14} weight="bold" />}
          </Box>
        </Box>
        <span>{children}</span>
      </Box>
      <Box sx={{ pl: '32px' }}>
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </Box>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'grid', gap: 2 }}>
      <Box component="legend" sx={{ p: 0, mb: 2, fontFamily: fontDisplay, fontWeight: 600, fontSize: '1rem', color: color.ink }}>
        {title}
      </Box>
      {children}
    </Box>
  );
}

function TermsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      sx={{ position: 'relative', color: color.ink, textDecoration: 'underline', textDecorationColor: color.muted, textUnderlineOffset: '3px', whiteSpace: 'nowrap', '&:hover': { textDecorationColor: color.accent }, '&:focus-visible': { outline: `2px solid ${color.focus}`, outlineOffset: 2, borderRadius: '2px' } }}
    >
      {children}
      <ArrowUpRight size={13} aria-hidden style={{ marginLeft: 2, verticalAlign: '-1px' }} />
      <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {' '}
        (opens in a new tab)
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ summary */

function Row({ label, value, strong = false, testId }: { label: ReactNode; value: ReactNode; strong?: boolean; testId?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'baseline', color: strong ? color.ink : color.ink2, fontSize: strong ? '1rem' : '0.9375rem', fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span>
      <Box component="span" data-testid={testId} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Box>
    </Box>
  );
}

function PromoCode({ adapter, disabled }: { adapter: CheckoutAdapter; disabled: boolean }) {
  const { summary } = adapter;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const uid = useId();

  if (summary.promotionCode) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: color.ink2 }}>
        <span>
          Code <Box component="strong" sx={{ color: color.ink, fontWeight: 600 }}>{summary.promotionCode}</Box> applied
        </span>
        <Button
          size="small"
          variant="text"
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            await adapter.removePromotionCode();
            setBusy(false);
          }}
          sx={{ color: color.ink2, minWidth: 0, textTransform: 'none' }}
        >
          Remove
        </Button>
      </Box>
    );
  }
  if (!open) {
    return (
      <Button size="small" variant="text" onClick={() => setOpen(true)} disabled={disabled} sx={{ justifySelf: 'start', px: 0, minWidth: 0, color: color.ink2, textTransform: 'none', '&:hover': { color: color.ink, bgcolor: 'transparent' } }}>
        Add a promo code
      </Button>
    );
  }
  const apply = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter a code.');
      return;
    }
    setBusy(true);
    setError(undefined);
    const r = await adapter.applyPromotionCode(trimmed);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else setCode('');
  };
  return (
    <Box>
      <Box component="label" htmlFor={`${uid}-promo`} sx={{ display: 'block', color: color.ink2, fontSize: '0.8125rem', fontWeight: 500, mb: 0.75 }}>
        Promo code
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Box
          component="input"
          id={`${uid}-promo`}
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled || busy}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${uid}-promo-error` : undefined}
          onChange={(e) => setCode((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void apply();
            }
          }}
          sx={{ ...inputSx, flex: 1, minWidth: 0, textTransform: 'uppercase' }}
        />
        <Button variant="outlined" onClick={apply} disabled={disabled || busy} sx={{ flex: 'none', minWidth: 76 }}>
          {busy ? <CircularProgress size={16} thickness={5} sx={{ color: color.ink2 }} aria-label="Applying" /> : 'Apply'}
        </Button>
      </Box>
      <FieldError id={`${uid}-promo-error`}>{error}</FieldError>
    </Box>
  );
}

function OrderSummary({ order, adapter, disabled }: { order: CheckoutFormOrder; adapter: CheckoutAdapter; disabled: boolean }) {
  const { summary } = adapter;
  const money = (n: number) => formatMoney(n, summary.currency);
  return (
    <Box
      component="aside"
      aria-label="Order summary"
      data-testid="checkout-order"
      sx={{ display: 'grid', gap: 1.5, p: { xs: 2, sm: 2.5 }, bgcolor: color.paper, border: `1px solid ${color.rule}`, borderRadius: `${radius.md}px`, alignSelf: 'start' }}
    >
      <Typography component="h3" sx={{ fontFamily: fontDisplay, fontWeight: 600, fontSize: '1rem' }}>
        Order summary
      </Typography>
      <Box sx={{ display: 'grid', gap: 0.5 }}>
        <Box sx={{ color: color.ink, fontWeight: 600 }}>{order.packName} license</Box>
        <Box sx={{ color: color.ink2, fontSize: '0.875rem' }}>
          {periodLabels[order.period]} · up to {order.maxServers ?? order.servers} servers
        </Box>
      </Box>
      <Box sx={{ height: '1px', bgcolor: color.rule }} />
      <Row label="Price" value={money(summary.subtotal)} testId="checkout-subtotal" />
      {summary.discount > 0 && <Row label="Promo discount" value={`−${money(summary.discount)}`} testId="checkout-discount" />}
      <PromoCode adapter={adapter} disabled={disabled} />
      <Box sx={{ height: '1px', bgcolor: color.rule }} />
      <Row
        strong
        label={
          <>
            Total{' '}
            <Box component="span" sx={{ color: color.muted, fontWeight: 400, fontSize: '0.8125rem' }}>
              {vatShort}
            </Box>
          </>
        }
        value={money(summary.total)}
        testId="checkout-total"
      />
      <Box sx={{ color: color.muted, fontSize: '0.8125rem', lineHeight: 1.45 }}>No VAT is added: the seller is not VAT-registered. You get an invoice by email.</Box>
    </Box>
  );
}

/* --------------------------------------------------------------------- form */

export function CheckoutForm({
  order,
  adapter,
  onPaying,
}: {
  order: CheckoutFormOrder;
  adapter: CheckoutAdapter;
  onPaying?: (paying: boolean) => void;
}) {
  const { summary } = adapter;
  const [values, setValues] = useState<Values>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const countries = useMemo(countryOptions, []);
  const emailFixed = summary.email !== null;

  const set = <K extends keyof Values>(key: K) => (value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as FieldKey]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const text = (key: keyof Values) => ({
    value: values[key] as string,
    onChange: (e: { target: EventTarget }) => set(key)((e.target as HTMLInputElement).value as never),
    disabled: processing,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (processing) return;
    setFormError(null);
    const found = validateForm(values, summary.sessionId, emailFixed);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      setFormError('Check the highlighted fields.');
      // Move focus to the first field that needs fixing.
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] select`)?.focus());
      return;
    }
    setProcessing(true);
    onPaying?.(true);
    const r = await adapter.pay({
      email: emailFixed ? (summary.email as string) : values.email.trim(),
      company: values.company,
      eventName: values.eventName,
      eventDates: values.eventDates,
      vatId: values.vatId,
      business: true,
      terms: true,
      address: { country: values.country, line1: values.line1.trim(), line2: values.line2.trim(), postal_code: values.postal_code.trim(), city: values.city.trim() },
    });
    if (r.ok) return; // Stripe.js is on its way to the thanks page; keep the button busy.
    setProcessing(false);
    onPaying?.(false);
    setFormError(r.error);
    if (r.field) setErrors((prev) => ({ ...prev, [r.field as FieldKey]: r.error }));
  };

  const payLabel = `Pay ${formatMoney(summary.total, summary.currency)}`;

  return (
    <Box
      component="form"
      noValidate
      onSubmit={submit}
      data-testid="checkout-form"
      aria-busy={processing}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 300px' },
        gap: { xs: 3, md: 4 },
        alignItems: 'start',
        px: { xs: 2, sm: 3 },
        py: { xs: 2.5, sm: 3 },
      }}
    >
      <Box sx={{ order: { xs: 0, md: 1 }, position: { md: 'sticky' }, top: { md: 0 } }}>
        <OrderSummary order={order} adapter={adapter} disabled={processing} />
      </Box>

      <Box sx={{ display: 'grid', gap: 4, minWidth: 0, order: { xs: 1, md: 0 } }}>
        <Section title="Your business">
          {emailFixed ? (
            <Box sx={{ color: color.ink2, fontSize: '0.9375rem' }}>
              License and invoice go to <Box component="strong" sx={{ color: color.ink, fontWeight: 600 }}>{summary.email}</Box>
            </Box>
          ) : (
            <Box data-field="email">
              <Field name="email" label="Email" hint="The license key and the invoice go here." error={errors.email}>
                {(p) => <Box component="input" type="email" autoComplete="email" inputMode="email" {...p} {...text('email')} sx={inputSx} />}
              </Field>
            </Box>
          )}
          <Box data-field="company">
            <Field name="company" label="Company or organization" hint="The licensee: shown on the license and the invoice." error={errors.company}>
              {(p) => <Box component="input" autoComplete="organization" maxLength={detailLimits.company.max} {...p} {...text('company')} sx={inputSx} />}
            </Field>
          </Box>
          <Box data-field="vatId">
            <Field name="vatId" label="VAT ID (optional)" hint="Shown on the invoice. Norway: your org. number." error={errors.vatId}>
              {(p) => <Box component="input" autoComplete="off" spellCheck={false} maxLength={detailLimits.vatId.max} {...p} {...text('vatId')} sx={{ ...inputSx, textTransform: 'uppercase' }} />}
            </Field>
          </Box>
          <Box data-field="business">
            <CheckRow name="business" checked={values.business} onChange={set('business')} error={errors.business} disabled={processing}>
              I&apos;m buying for a business or organization, not as a consumer.
            </CheckRow>
          </Box>
        </Section>

        <Section title="The event">
          <Box data-field="eventName">
            <Field name="eventName" label="Event or client name, and website" hint="Paid operators name the event or client they run it for." error={errors.eventName}>
              {(p) => <Box component="input" maxLength={detailLimits.eventName.max} placeholder="Example LAN 2026, examplelan.no" {...p} {...text('eventName')} sx={inputSx} />}
            </Field>
          </Box>
          <Box data-field="eventDates">
            <Field name="eventDates" label="Event date(s)" hint="Yearly or founding supporter: the start date." error={errors.eventDates}>
              {(p) => <Box component="input" maxLength={detailLimits.eventDates.max} placeholder="3–5 October 2026" {...p} {...text('eventDates')} sx={inputSx} />}
            </Field>
          </Box>
        </Section>

        <Section title="Billing address">
          <Box data-field="country">
            <Field name="country" label="Country" error={errors.country}>
              {(p) => (
                <Box component="select" autoComplete="country" {...p} {...text('country')} sx={{ ...inputSx, appearance: 'none', cursor: 'pointer', backgroundImage: `linear-gradient(45deg, transparent 50%, ${'currentColor'} 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)`, backgroundPosition: 'calc(100% - 18px) 50%, calc(100% - 13px) 50%', backgroundSize: '5px 5px', backgroundRepeat: 'no-repeat', pr: 5 }}>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Box>
              )}
            </Field>
          </Box>
          <Box data-field="line1">
            <Field name="line1" label="Street address" error={errors.line1}>
              {(p) => <Box component="input" autoComplete="address-line1" {...p} {...text('line1')} sx={inputSx} />}
            </Field>
          </Box>
          <Field name="line2" label="Address line 2 (optional)">
            {(p) => <Box component="input" autoComplete="address-line2" {...p} {...text('line2')} sx={inputSx} />}
          </Field>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '160px minmax(0, 1fr)' }, gap: 2 }}>
            <Box data-field="postal_code">
              <Field name="postal_code" label="Postal code" error={errors.postal_code}>
                {(p) => <Box component="input" autoComplete="postal-code" {...p} {...text('postal_code')} sx={inputSx} />}
              </Field>
            </Box>
            <Box data-field="city">
              <Field name="city" label="City" error={errors.city}>
                {(p) => <Box component="input" autoComplete="address-level2" {...p} {...text('city')} sx={inputSx} />}
              </Field>
            </Box>
          </Box>
        </Section>

        <Section title="Payment">
          <Box data-testid="checkout-payment" sx={{ minHeight: 120 }}>
            {adapter.payment}
          </Box>
        </Section>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box data-field="terms">
            <CheckRow name="terms" checked={values.terms} onChange={set('terms')} error={errors.terms} disabled={processing}>
              I accept the <TermsLink href="/terms">Commercial License Terms</TermsLink> and the <TermsLink href="/terms-of-sale">Terms of Sale</TermsLink>.
            </CheckRow>
          </Box>

          {formError && (
            <Box role="alert" data-testid="checkout-form-error" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.5, borderRadius: `${radius.sm}px`, border: `1px solid ${color.ban}`, color: color.ink, fontSize: '0.9375rem' }}>
              <WarningCircle size={18} aria-hidden style={{ flex: 'none', marginTop: 1, color: 'var(--at-ban)' }} />
              <span>{formError}</span>
            </Box>
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={processing}
            data-testid="checkout-pay"
            sx={{ minHeight: 52, fontSize: '1rem', fontWeight: 600, '&.Mui-disabled': { bgcolor: color.accent, color: color.accentInk, opacity: 0.75 } }}
          >
            {processing ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
                <CircularProgress size={18} thickness={5} sx={{ color: 'inherit' }} aria-hidden />
                Processing…
              </Box>
            ) : (
              payLabel
            )}
          </Button>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'center', color: color.muted, fontSize: '0.8125rem' }}>
            <LockSimple size={14} aria-hidden />
            <span>Payment by Stripe. Card details go straight to Stripe, never to us.</span>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
