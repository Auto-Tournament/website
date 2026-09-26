'use client';

import { useId, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import { tokens } from '@/theme/tokens';
import { fontDisplay } from '@/theme/theme';
import { mono } from '@/components/ui';
import type { CompatCheck, CompatRunSummary, CompatSnapshot, CompatView } from '@/lib/compat/document';
import { runProgress } from '@/lib/compat/steps';
import { CompatDot, compatTone, compatToneColor } from './CompatDot';
import { CompatRunSteps } from './CompatRunSteps';
import {
  checkStatusLabel,
  componentStatusLabel,
  cs2Label,
  kindLabel,
  overallHint,
  overallLabel,
  progressLabel,
  relativeTime,
  stageLabel,
  stateLabel,
  triggerLabel,
  utcTime,
} from './labels';
import { useCompatLive, useNow, type CompatLiveMode } from './useCompatLive';

const { color, radius } = tokens;

const panel = { bgcolor: color.paper2, border: `1px solid ${color.rule}`, borderRadius: `${radius.lg}px` } as const;
const link = { color: 'inherit', textDecoration: 'underline', textDecorationColor: color.rule, '&:hover': { color: color.ink } } as const;

function TimeAgo({ iso, now, prefix = '' }: { iso: string; now: number; prefix?: string }) {
  return (
    <time dateTime={iso} title={utcTime(iso)}>
      {prefix}
      {relativeTime(iso, now)}
    </time>
  );
}

function RunLink({ href }: { href: string }) {
  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" sx={{ ...link, whiteSpace: 'nowrap' }}>
      View run ↗
    </Box>
  );
}

function LiveState({ mode }: { mode: CompatLiveMode }) {
  const text = { connecting: 'Connecting…', live: 'Live', polling: 'Updates every minute' }[mode];
  return (
    <Box
      data-testid="compat-live"
      data-mode={mode}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: color.muted, fontSize: '0.8125rem', minHeight: 24 }}
    >
      <CompatDot tone={mode === 'live' ? 'pass' : 'none'} size={8} />
      <span aria-live="polite">{text}</span>
    </Box>
  );
}

/** The run a "Checking…" panel mentions as the last verdict: the newest one that finished with a result. */
function previousVerdict(latest: CompatSnapshot, runs: CompatRunSummary[]): CompatRunSummary | undefined {
  return runs.find((r) => r.run.id !== latest.run.id && ['pass', 'warn', 'fail'].includes(r.overall));
}

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Box sx={{ color: color.muted, fontSize: '0.8125rem', mb: 0.5 }}>{label}</Box>
      <Box sx={{ color: color.ink, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

/** The verdict at the top: overall status, when it was checked, and what was checked. */
function Verdict({ latest, runs, now }: { latest: CompatSnapshot; runs: CompatRunSummary[]; now: number }) {
  // While the run is still going, a stage that finished early does not get to say "Compatible".
  const progress = runProgress(latest, now);
  const overall = progress.inProgress ? 'checking' : latest.overall;
  const where = progressLabel(progress);
  const tone = compatTone(overall);
  const previous = overall === 'checking' ? previousVerdict(latest, runs) : undefined;
  return (
    <Box data-testid="compat-overall" sx={{ ...panel, p: { xs: 3, md: 4 }, display: 'grid', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
        <CompatDot tone={tone} size={18} data-testid="compat-overall-dot" />
        <Box sx={{ minWidth: 0, flex: '1 1 18rem' }}>
          <Typography
            component="h2"
            data-testid="compat-overall-status"
            data-status={overall}
            sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 'clamp(1.6rem, 1.4vw + 1rem, 2.25rem)', letterSpacing: '-0.02em', lineHeight: 1.1, color: compatToneColor[tone] }}
          >
            {overallLabel[overall]}
            {overall === 'checking' && (
              <Box component="span" sx={{ color: color.ink2 }}>
                {' '}
                {cs2Label(latest.cs2)}
              </Box>
            )}
            {where && (
              <Box
                component="span"
                data-testid="compat-overall-progress"
                sx={{ display: 'block', mt: 0.75, fontFamily: 'inherit', fontWeight: 600, fontSize: '1.0625rem', letterSpacing: 0, lineHeight: 1.35, color: color.ink }}
              >
                ({where.charAt(0).toLowerCase()}
                {where.slice(1)})
              </Box>
            )}
          </Typography>
          <Typography sx={{ color: color.ink2, mt: 0.75, maxWidth: '60ch' }}>{overallHint[overall]}</Typography>
          {previous && (
            <Typography data-testid="compat-previous" sx={{ color: color.muted, mt: 0.75, fontSize: '0.875rem' }}>
              Last result: {overallLabel[previous.overall]} on {cs2Label(previous.cs2)}, <TimeAgo iso={previous.checked_at} now={now} />.
            </Typography>
          )}
        </Box>
        <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, fontSize: '0.875rem', color: color.muted, display: 'grid', gap: 0.5 }}>
          <Box data-testid="compat-checked-ago">
            <TimeAgo iso={latest.checked_at} now={now} prefix="Checked " />
          </Box>
          {latest.run.url && <RunLink href={latest.run.url} />}
        </Box>
      </Box>
      <Box
        aria-label="What was checked"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 2,
          pt: 3,
          borderTop: `1px solid ${color.rule}`,
        }}
      >
        <Fact label="CS2 patch" testId="compat-patch">
          <Box sx={mono}>{latest.cs2.patch || '—'}</Box>
        </Fact>
        <Fact label="Build ID" testId="compat-buildid">
          <Box sx={mono}>{latest.cs2.buildid}</Box>
        </Fact>
        <Fact label="Ready Up" testId="compat-readyup">
          <Box sx={mono} title={latest.readyup.commit}>
            {latest.readyup.version}
          </Box>
        </Fact>
        <Fact label="Stage" testId="compat-stage">
          {stageLabel[latest.run.stage]} · {progress.inProgress ? stateLabel.checking : stateLabel[latest.run.state]}
        </Fact>
      </Box>
    </Box>
  );
}

function CheckRow({ check }: { check: CompatCheck }) {
  const tone = compatTone(check.status);
  const counted = check.total > 0 || check.status !== 'pending';
  return (
    <Box component="li" data-testid={`compat-check-${check.kind}`} sx={{ py: 1.25, '& + &': { borderTop: `1px solid ${color.rule}` } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', alignItems: 'center', gap: 1.5 }}>
        <CompatDot tone={tone} size={8} />
        <Box sx={{ fontWeight: 500, minWidth: 0 }}>{kindLabel[check.kind]}</Box>
        <Box sx={{ ...mono, fontSize: '0.8125rem', color: color.ink2 }}>{counted ? `${check.passed}/${check.total}` : '—'}</Box>
        <Box sx={{ fontSize: '0.8125rem', color: compatToneColor[tone], minWidth: '4.5rem', textAlign: 'right' }}>{checkStatusLabel[check.status]}</Box>
      </Box>
      {check.failures.length > 0 && (
        <Box
          component="ul"
          aria-label="Failures"
          sx={{
            ...mono,
            listStyle: 'none',
            m: 0,
            mt: 1,
            ml: 2.5,
            p: 1.5,
            bgcolor: color.paper3,
            borderRadius: `${radius.sm}px`,
            fontSize: '0.75rem',
            color: color.ink2,
            display: 'grid',
            gap: 0.5,
            overflowWrap: 'anywhere',
          }}
        >
          {check.failures.map((failure, i) => (
            <li key={i}>{failure}</li>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** "39 of 39 checks passed · live check pending", or why there is nothing to count. */
function componentSummary(component: CompatSnapshot['components'][number]): string {
  if (component.status === 'checking') return 'Being checked';
  const counted = component.checks.filter((c) => c.status !== 'pending');
  const pending = component.checks.some((c) => c.status === 'pending');
  if (counted.length === 0) {
    return pending ? 'No engine access to check · live check pending' : 'No checks reported';
  }
  const passed = counted.reduce((sum, c) => sum + c.passed, 0);
  const total = counted.reduce((sum, c) => sum + c.total, 0);
  return `${passed} of ${total} checks passed${pending ? ' · live check pending' : ''}`;
}

function ComponentRow({ component }: { component: CompatSnapshot['components'][number] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const tone = compatTone(component.status);
  const summary = componentSummary(component);
  return (
    <Box component="li" data-testid={`compat-component-${component.id}`} sx={{ '& + &': { borderTop: `1px solid ${color.rule}` } }}>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
          alignItems: 'center',
          gap: { xs: 1.5, sm: 2 },
          px: { xs: 2, sm: 3 },
          py: 2,
          textAlign: 'left',
          fontSize: '1rem',
          '&:hover': { bgcolor: color.paper3 },
          '&.Mui-focusVisible': { outline: `2px solid ${color.focus}`, outlineOffset: -2 },
        }}
      >
        <CompatDot tone={tone} data-testid={`compat-component-dot-${component.id}`} />
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontWeight: 600, color: color.ink }}>{component.name}</Box>
          <Box sx={{ fontSize: '0.8125rem', color: color.muted }}>{summary}</Box>
        </Box>
        <Box
          data-testid={`compat-component-status-${component.id}`}
          data-status={component.status}
          sx={{ fontSize: '0.875rem', fontWeight: 500, color: compatToneColor[tone], textAlign: 'right' }}
        >
          {componentStatusLabel[component.status]}
        </Box>
        <Box
          component="svg"
          viewBox="0 0 16 16"
          aria-hidden
          sx={{ width: 16, height: 16, color: color.muted, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </Box>
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box id={panelId} sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
          {component.checks.length === 0 ? (
            <Typography sx={{ color: color.muted, fontSize: '0.875rem' }}>
              {component.status === 'checking' ? 'Results arrive when the check finishes.' : 'No checks reported.'}
            </Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {component.checks.map((check, i) => (
                <CheckRow key={`${check.kind}-${i}`} check={check} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

function History({ runs, now }: { runs: CompatRunSummary[]; now: number }) {
  return (
    <Box component="ul" data-testid="compat-history" sx={{ ...panel, listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}>
      {runs.map((run) => {
        const tone = compatTone(run.overall);
        return (
          <Box
            component="li"
            key={run.run.id}
            data-testid="compat-history-run"
            data-run-id={run.run.id}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'auto minmax(0, 1fr) auto', md: 'auto minmax(0, 1.3fr) minmax(0, 1fr) 8.5rem auto' },
              alignItems: 'center',
              gap: 2,
              px: { xs: 2, sm: 3 },
              py: 1.5,
              fontSize: '0.875rem',
              '& + &': { borderTop: `1px solid ${color.rule}` },
            }}
          >
            <CompatDot tone={tone} size={8} />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontWeight: 500, color: color.ink }}>
                {run.cs2.patch ? `CS2 ${run.cs2.patch}` : 'CS2'}{' '}
                <Box component="span" sx={{ ...mono, color: color.muted, fontWeight: 400, fontSize: '0.8125rem' }}>
                  build {run.cs2.buildid}
                </Box>
              </Box>
              <Box sx={{ color: compatToneColor[tone] }}>{overallLabel[run.overall]}</Box>
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' }, color: color.muted, minWidth: 0 }}>
              {triggerLabel[run.run.trigger]} · {stageLabel[run.run.stage]}
            </Box>
            <Box sx={{ display: { xs: 'none', md: 'block' }, color: color.muted }}>
              <TimeAgo iso={run.run.started_at} now={now} />
            </Box>
            {run.run.url ? <RunLink href={run.run.url} /> : <span />}
          </Box>
        );
      })}
    </Box>
  );
}

function SectionTitle({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, mb: 2 }}>
      <Typography id={id} variant="h3" component="h2">
        {children}
      </Typography>
      {aside}
    </Box>
  );
}

/** "Partial": the components of a run that is still going show only the stages finished so far. */
function PartialNote() {
  return (
    <Box
      component="span"
      data-testid="compat-partial"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.8125rem', color: color.warn }}
    >
      <CompatDot tone="checking" size={6} />
      Partial: results so far, the run is still going
    </Box>
  );
}

/**
 * The live part of /compatibility: the verdict, the components and the
 * recent runs. Rendered on the server with the data it had, then kept
 * current over server-sent events (useCompatLive).
 */
export function CompatibilityLive({ initial, serverNow }: { initial: CompatView; serverNow: number }) {
  const { view, mode } = useCompatLive(initial);
  const now = useNow(serverNow);
  const { latest, runs } = view;
  const inProgress = latest ? runProgress(latest, now).inProgress : false;
  const hasSteps = (latest?.run.steps?.length ?? 0) > 0;

  return (
    <Box data-testid="compat-live-root" sx={{ display: 'grid', gap: { xs: 5, md: 6 } }}>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <LiveState mode={mode} />
        </Box>
        {latest ? (
          <Verdict latest={latest} runs={runs} now={now} />
        ) : (
          <Box data-testid="compat-empty" sx={{ ...panel, p: { xs: 3, md: 4 }, display: 'flex', gap: 2.5, alignItems: 'center' }}>
            <CompatDot tone="none" size={18} />
            <div>
              <Typography component="h2" sx={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em' }}>
                No check yet
              </Typography>
              <Typography sx={{ color: color.ink2, mt: 0.5, maxWidth: '60ch' }}>
                The first result shows up here as soon as Ready Up&apos;s CI reports one. This page updates by itself.
              </Typography>
            </div>
          </Box>
        )}
      </Box>

      {latest && hasSteps && (
        <Box component="section" aria-labelledby="compat-run-title">
          <SectionTitle id="compat-run-title">{inProgress ? 'Current run' : 'Last run'}</SectionTitle>
          <CompatRunSteps latest={latest} serverNow={now} />
        </Box>
      )}

      {latest && latest.components.length > 0 && (
        <Box component="section" aria-labelledby="compat-components-title">
          <SectionTitle id="compat-components-title" aside={inProgress ? <PartialNote /> : undefined}>
            Components
          </SectionTitle>
          <Box component="ul" data-testid="compat-components" sx={{ ...panel, listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}>
            {latest.components.map((component) => (
              <ComponentRow key={component.id} component={component} />
            ))}
          </Box>
        </Box>
      )}

      {runs.length > 0 && (
        <Box component="section" aria-labelledby="compat-history-title">
          <SectionTitle id="compat-history-title">Recent runs</SectionTitle>
          <History runs={runs} now={now} />
        </Box>
      )}
    </Box>
  );
}
