import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

/** License id → /verify?id=…, which redirects to /verify/<id>. A plain GET form: works without JavaScript. */
export function VerifyForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <Box component="form" action="/verify" method="get" sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start', maxWidth: 520 }}>
      <TextField
        name="id"
        label="License id"
        placeholder="L-…"
        defaultValue={defaultValue}
        required
        autoComplete="off"
        size="small"
        sx={{ flex: '1 1 240px' }}
        slotProps={{ htmlInput: { maxLength: 60, spellCheck: false } }}
      />
      <Button type="submit" variant="outlined">
        Check
      </Button>
    </Box>
  );
}
