'use client';

import { useId, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { mono } from '@/components/ui';
import type { CompatSnapshot, CompatStep, CompatStepStatus } from '@/lib/compat/document';
import { runProgress, topLevelSteps } from '@/lib/compat/steps';
import { durationLabel, progressLabel, stepStatusLabel } from './labels';
import { useNow } from './useCompatLive';

const { color, radius } = tokens;

const statusColor: Record<CompatStepStatus, string> = {
  queued: color.muted,
  running: color.info,
  pass: color.live,
  fail: color.ban,
  skip: color.muted,
};

/** The step's status as an icon, like a GitHub Actions step: ring, spinner, tick, cross, skipped. Named for screen readers. */
export function StepIcon({ status, size = 18 }: { status: CompatStepStatus; size?: number }) {
  const c = statusColor[status];
  const shapes: Record<CompatStepStatus, React.ReactNode> = {
    queued: <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.4" />,
    running: (
      <>
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    pass: (
      <>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke={color.paper} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    fail: (
      <>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" fill="none" stroke={color.paper} strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
    skip: (
      <>
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 12L12 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <Box
      component="svg"
      viewBox="0 0 16 16"
      role="img"
      aria-label={stepStatusLabel[status]}
      data-status={status}
      sx={[
        { width: size, height: size, flex: 'none', color: c, display: 'block' },
        status === 'running' && {
          animation: 'compatStepSpin 0.9s linear infinite',
          '@keyframes compatStepSpin': { to: { transform: 'rotate(360deg)' } },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
      ]}
    >
      {shapes[status]}
    </Box>
  );
}

/** How long the step took, or has been running so far; empty while queued. */
function elapsed(step: CompatStep, now: number): string {
  if (!step.started_at || step.status === 'queued') return '';
  const start = Date.parse(step.started_at);
  const end = step.status === 'running' ? now : step.finished_at ? Date.parse(step.finished_at) : NaN;
  return durationLabel(end - start);
}

function StepRow({ step, now, nested = false, children }: { step: CompatStep; now: number; nested?: boolean; children?: React.ReactNode }) {
  const time = elapsed(step, now);
  const failed = step.status === 'fail';
  return (
    <Box
      component="li"
      data-testid="compat-step"
      data-step-id={step.id}
      data-status={step.status}
      aria-current={step.status === 'running' ? 'step' : undefined}
      sx={{ '& + &': { borderTop: nested ? 'none' : `1px solid ${color.rule}` } }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: { xs: 1.25, sm: 1.5 },
          px: nested ? 0 : { xs: 2, sm: 3 },
          py: nested ? 0.75 : 1.5,
        }}
      >
        <StepIcon status={step.status} size={nested ? 14 : 18} />
        <Box
          sx={{
            minWidth: 0,
            overflowWrap: 'anywhere',
            fontSize: nested ? '0.8125rem' : '0.9375rem',
            fontWeight: nested ? 400 : 500,
            color: step.status === 'queued' || step.status === 'skip' ? color.muted : color.ink,
          }}
        >
          {step.name}
        </Box>
        <Box
          component="span"
          data-testid="compat-step-time"
          sx={{ ...mono, fontSize: '0.75rem', color: step.status === 'running' ? color.info : color.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          {time}
        </Box>
      </Box>
      {step.detail && (
        <Box
          data-testid="compat-step-detail"
          sx={{
            ...mono,
            ml: nested ? 3.25 : { xs: 6, sm: 7 },
            mr: nested ? 0 : { xs: 2, sm: 3 },
            mb: nested ? 0.5 : 1.5,
            mt: nested ? 0 : -0.5,
            fontSize: '0.75rem',
            overflowWrap: 'anywhere',
            ...(failed
              ? { p: 1.25, bgcolor: color.paper3, borderRadius: `${radius.sm}px`, color: color.ink2, borderLeft: `2px solid ${color.ban}` }
              : { color: color.muted }),
          }}
        >
          {step.detail}
        </Box>
      )}
      {children}
    </Box>
  );
}

/** A top-level step with its own nested steps (the live test's), folded away once it passed. */
function StepGroup({ step, subSteps, now }: { step: CompatStep; subSteps: CompatStep[]; now: number }) {
  const listId = useId();
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (step.status === 'running' || step.status === 'fail');
  const done = subSteps.filter((s) => s.status === 'pass').length;
  return (
    <StepRow step={step} now={now}>
      {subSteps.length > 0 && (
        <Box sx={{ ml: { xs: 6, sm: 7 }, mr: { xs: 2, sm: 3 }, mb: 1.5, mt: -0.5 }}>
          <ButtonBase
            onClick={() => setManual(!open)}
            aria-expanded={open}
            aria-controls={listId}
            sx={{
              fontSize: '0.8125rem',
              color: color.muted,
              borderRadius: `${radius.sm}px`,
              px: 0.5,
              ml: -0.5,
              minHeight: 28,
              '&:hover': { color: color.ink },
              '&.Mui-focusVisible': { outline: `2px solid ${color.focus}` },
            }}
          >
            {open ? 'Hide' : 'Show'} {subSteps.length} live test steps ({done} passed)
          </ButtonBase>
          {open && (
            <Box component="ol" id={listId} sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, pl: 1.5, borderLeft: `1px solid ${color.rule}` }}>
              {subSteps.map((s) => (
                <StepRow key={s.id} step={s} now={now} nested />
              ))}
            </Box>
          )}
        </Box>
      )}
    </StepRow>
  );
}

/**
 * The steps of the newest run, GitHub Actions style: each with its status
 * icon and time (ticking while it runs), the reason when one failed, and a
 * link to the CI run. Only step changes are announced (aria-live), not the
 * ticking clock.
 */
export function CompatRunSteps({ latest, serverNow }: { latest: CompatSnapshot; serverNow: number }) {
  const steps = latest.run.steps ?? [];
  const progress = runProgress(latest, serverNow);
  // Ticks every second while a step runs, so its time counts up.
  const now = useNow(serverNow, progress.inProgress ? 1000 : 30_000);
  const live = runProgress(latest, now);
  const top = topLevelSteps(steps);
  const where = progressLabel(live);
  const failed = top.filter((s) => s.status === 'fail').length;
  const summary = live.inProgress
    ? (where ?? 'Starting…')
    : failed > 0
      ? `Finished: ${failed} of ${top.length} steps failed`
      : `Finished: ${top.filter((s) => s.status === 'pass').length} of ${top.length} steps passed`;
  const runTime = durationLabel((live.inProgress ? now : Date.parse(latest.run.finished_at ?? latest.checked_at)) - Date.parse(latest.run.started_at));

  return (
    <Box data-testid="compat-run-steps" data-in-progress={live.inProgress} sx={{ bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px`, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: { xs: 1, sm: 2 },
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: `1px solid ${color.rule}`,
        }}
      >
        <Typography
          data-testid="compat-run-steps-summary"
          aria-live="polite"
          sx={{ flex: '1 1 14rem', minWidth: 0, color: live.inProgress ? color.ink : color.ink2, fontWeight: 500, fontSize: '0.9375rem', overflowWrap: 'anywhere' }}
        >
          {summary}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', fontSize: '0.8125rem', color: color.muted }}>
          {runTime && (
            <Box component="span" sx={{ ...mono, fontVariantNumeric: 'tabular-nums' }} title={live.inProgress ? 'Running for' : 'Took'}>
              {live.inProgress ? 'Running ' : 'Took '}
              {runTime}
            </Box>
          )}
          {latest.run.url && (
            <Box
              component="a"
              href={latest.run.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, whiteSpace: 'nowrap', '&:hover': { color: color.ink } }}
            >
              GitHub run ↗
            </Box>
          )}
        </Box>
      </Box>
      <Box component="ol" aria-label="Steps" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {top.map((s) => (
          <StepGroup key={s.id} step={s} subSteps={steps.filter((c) => c.parent === s.id)} now={now} />
        ))}
      </Box>
    </Box>
  );
}
