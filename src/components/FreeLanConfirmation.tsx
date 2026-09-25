import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { freeLanMailto } from '@/components/pricing';
import { seller } from '@/components/seller';

const { color, radius } = tokens;

/**
 * The optional free LAN confirmation, shown by the free tier and in the
 * calculator's free result. Voluntary: PolyForm already grants non-commercial
 * use, so never word it as a requirement. No hooks, so it renders in both
 * server and client components.
 */
export function FreeLanConfirmation({ compact = false }: { compact?: boolean }) {
  return (
    <Box
      component="aside"
      aria-labelledby={compact ? undefined : 'free-lan-confirmation'}
      data-testid="free-lan-confirmation"
      sx={{
        border: `1px solid ${color.rule}`,
        borderRadius: `${radius.md}px`,
        bgcolor: compact ? 'transparent' : color.paper2,
        p: compact ? 1.75 : 2.5,
        display: 'grid',
        gap: 0.75,
        maxWidth: '60ch',
      }}
    >
      <Typography id={compact ? undefined : 'free-lan-confirmation'} component="h4" sx={{ fontWeight: 600, color: color.ink }}>
        Running a zero-profit LAN?
      </Typography>
      <Typography sx={{ color: color.ink2, fontSize: '0.9375rem' }}>
        It&apos;s free, no registration needed. Want it in writing? Tell us about your event and we&apos;ll send you a free confirmation. It&apos;s optional: the
        license already allows non-commercial use.
      </Typography>
      <Box
        component="a"
        href={freeLanMailto(seller.email)}
        sx={{ color: color.ink, fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'underline', textDecorationColor: color.rule, justifySelf: 'start' }}
      >
        Ask for a free confirmation
      </Box>
    </Box>
  );
}
