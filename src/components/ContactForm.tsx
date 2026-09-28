'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { seller } from '@/components/seller';
import {
  contactTopics,
  contactTopicsWithEventDetails,
  honeypotField,
  maxMessageLength,
  maxNameLength,
  maxOrgLength,
  type ContactTopic,
} from '@/lib/contact';

const { color } = tokens;

const topicFromQuery: Record<string, ContactTopic> = {
  quote: 'quote',
  'free-lan': 'free-lan',
  invoice: 'invoice',
  license: 'license',
  other: 'other',
};

type State = 'idle' | 'busy' | 'sent' | 'error';

/**
 * The /contact form: POST /api/contact. Topic can be preselected with
 * ?topic=quote|free-lan|invoice|license|other. A hidden, off-screen honeypot
 * field catches bots; the server pretends success either way, so the UI
 * never distinguishes it.
 */
export function ContactForm({ emailAvailable = true }: { emailAvailable?: boolean }) {
  const searchParams = useSearchParams();
  const initialTopic = useMemo<ContactTopic>(() => {
    const q = searchParams.get('topic') ?? '';
    return topicFromQuery[q] ?? 'license';
  }, [searchParams]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [numServers, setNumServers] = useState('');
  const [eventDates, setEventDates] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const showEventDetails = contactTopicsWithEventDetails.includes(topic);

  if (!emailAvailable) {
    return (
      <Typography sx={{ color: color.ink2, maxWidth: '48ch' }}>
        The contact form isn&apos;t available right now. Email us directly at{' '}
        <a href={`mailto:${seller.email}`}>{seller.email}</a>.
      </Typography>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          organization,
          topic,
          numServers: showEventDetails ? numServers : '',
          eventDates: showEventDetails ? eventDates : '',
          message,
          [honeypotField]: honeypot,
        }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (res.ok && data?.message) {
        setState('sent');
      } else {
        setState('error');
        setError(data?.error ?? "Couldn't send your message. Try again, or email us directly.");
      }
    } catch {
      setState('error');
      setError("Couldn't reach the site. Try again, or email us directly.");
    }
  };

  if (state === 'sent') {
    return (
      <Typography role="status" sx={{ color: color.ink, fontWeight: 600, maxWidth: '48ch' }}>
        Thanks, we&apos;ll reply within 2 working days.
      </Typography>
    );
  }

  const busy = state === 'busy';

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ display: 'grid', gap: 2, maxWidth: 520 }}>
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoComplete="name"
        slotProps={{ htmlInput: { maxLength: maxNameLength } }}
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
      />
      <TextField
        label="Organization"
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
        autoComplete="organization"
        slotProps={{ htmlInput: { maxLength: maxOrgLength } }}
      />
      <TextField label="Topic" select value={topic} onChange={(e) => setTopic(e.target.value as ContactTopic)} required>
        {contactTopics.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.label}
          </MenuItem>
        ))}
      </TextField>
      {showEventDetails && (
        <>
          <TextField
            label="Number of servers"
            value={numServers}
            onChange={(e) => setNumServers(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            label="Event dates"
            value={eventDates}
            onChange={(e) => setEventDates(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </>
      )}
      <TextField
        label="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        multiline
        minRows={5}
        helperText={`${message.length}/${maxMessageLength}`}
        slotProps={{ htmlInput: { maxLength: maxMessageLength } }}
      />
      {/* Honeypot: off-screen and unreachable by keyboard, so real visitors never see or fill it. */}
      <Box
        aria-hidden="true"
        sx={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
      >
        <TextField
          label="Website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <Button type="submit" variant="contained" disabled={busy} aria-busy={busy}>
          {busy ? 'Sending…' : 'Send message'}
        </Button>
      </Box>
      {state === 'error' && error && (
        <Typography role="alert" sx={{ color: color.ban, fontSize: '0.9375rem' }}>
          {error} Prefer email? <a href={`mailto:${seller.email}`}>{seller.email}</a>
        </Typography>
      )}
    </Box>
  );
}
