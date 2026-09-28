import TextField from '@mui/material/TextField';

export type TermsValues = { licensee: string; product: string; pack: string; maxServers: string; kind: string; startDay: string; endDay: string };

/**
 * The license terms in a form: licensee, product, pack, server limit, kind and
 * dates. Plain fields (no client state), checked on the server by
 * checkTerms (src/lib/admin/licenses.ts).
 */
export function TermsFields({ values, mode, currentMaxServers }: { values?: Partial<TermsValues>; mode: 'new' | 'reissue'; currentMaxServers?: number }) {
  const v = values ?? {};
  const dateProps = { inputLabel: { shrink: true } } as const;
  return (
    <>
      <TextField
        name="licensee"
        label="Licensee (business name)"
        defaultValue={v.licensee ?? ''}
        required={mode === 'new'}
        helperText={mode === 'reissue' ? 'Shown in the products. Empty removes it.' : 'Shown in the products and on the public check.'}
        slotProps={{ htmlInput: { maxLength: 200 } }}
        sx={{ gridColumn: '1 / -1' }}
      />
      <TextField select name="product" label="Product" defaultValue={v.product ?? 'servers'} slotProps={{ select: { native: true } }}>
        <option value="servers">Servers</option>
        <option value="platform">Platform</option>
      </TextField>
      <TextField select name="pack" label="Pack" defaultValue={v.pack ?? 'M'} slotProps={{ select: { native: true } }}>
        <option value="S">S</option>
        <option value="M">M</option>
        <option value="L">L</option>
      </TextField>
      <TextField
        name="maxServers"
        label="Server limit"
        defaultValue={v.maxServers ?? ''}
        inputMode="numeric"
        helperText={mode === 'new' || currentMaxServers === undefined ? "Empty: the pack's limit." : `Empty: the pack's limit. Now ${currentMaxServers}.`}
        slotProps={{ htmlInput: { maxLength: 6, pattern: '[0-9]*' } }}
      />
      <TextField select name="kind" label="Kind" defaultValue={v.kind ?? 'event'} slotProps={{ select: { native: true } }}>
        <option value="event">Per event</option>
        <option value="year">Yearly</option>
        <option value="founder">Founding supporter</option>
      </TextField>
      <TextField
        name="startDay"
        label="Start"
        type="date"
        defaultValue={v.startDay ?? ''}
        helperText="Event: first day. Yearly: the day updates count from (empty: today). Founder: not used."
        slotProps={dateProps}
      />
      <TextField
        name="endDay"
        label="End"
        type="date"
        defaultValue={v.endDay ?? ''}
        helperText="Event: last day (at most 5 days). Yearly: updates until (empty: start + 12 months). Founder: not used."
        slotProps={dateProps}
      />
    </>
  );
}
