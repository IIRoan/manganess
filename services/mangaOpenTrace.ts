import { logger } from '@/utils/logger';
import { reportMetric } from '@/services/telemetryService';

export const MANGA_OPEN_ROUTE = '/manga/[id]';

export type MangaOpenPhase =
  | 'press'
  | 'mount'
  | 'visible'
  | 'hydrated'
  | 'header'
  | 'chapters'
  | 'complete';

const REUSE_WINDOW_MS = 2000;
const PHASE_METRIC: Record<Exclude<MangaOpenPhase, 'press'>, string> = {
  mount: 'manga.open.mount',
  visible: 'manga.open.visible',
  hydrated: 'manga.open.hydrated',
  header: 'manga.open.header',
  chapters: 'manga.open.chapters',
  complete: 'manga.open.complete',
};

export interface MangaOpenSummary {
  source: string;
  pressToMountMs: number | null;
  pressToVisibleMs: number | null;
  pressToHydratedMs: number | null;
  pressToHeaderMs: number | null;
  pressToChaptersMs: number | null;
  pressToCompleteMs: number | null;
  mountToVisibleMs: number | null;
  mountToHeaderMs: number | null;
  headerToChaptersMs: number | null;
}

interface MangaOpenTraceState {
  mangaId: string;
  source: string;
  startedAt: number;
  generation: number;
  marks: Partial<Record<MangaOpenPhase, number>>;
}

let generation = 0;
let current: MangaOpenTraceState | null = null;

function nowMs(): number {
  return (
    (
      globalThis as { performance?: { now?: () => number } }
    ).performance?.now?.() ?? Date.now()
  );
}

function durationFromPress(
  trace: MangaOpenTraceState,
  phase: MangaOpenPhase
): number | null {
  const markedAt = trace.marks[phase];
  if (markedAt == null) {
    return null;
  }
  return Math.round(markedAt - trace.startedAt);
}

function durationBetween(
  trace: MangaOpenTraceState,
  from: MangaOpenPhase,
  to: MangaOpenPhase
): number | null {
  const start = trace.marks[from];
  const end = trace.marks[to];
  if (start == null || end == null) {
    return null;
  }
  return Math.round(end - start);
}

function formatMs(value: number | null): string {
  return value == null ? '—' : `${value}ms`;
}

function logToConsole(message: string): void {
  // Always print so Metro/logcat show timings without EXPO_PUBLIC_DEBUG.
  // eslint-disable-next-line no-console
  console.log(message);
}

function buildSummary(trace: MangaOpenTraceState): MangaOpenSummary {
  return {
    source: trace.source,
    pressToMountMs: durationFromPress(trace, 'mount'),
    pressToVisibleMs: durationFromPress(trace, 'visible'),
    pressToHydratedMs: durationFromPress(trace, 'hydrated'),
    pressToHeaderMs: durationFromPress(trace, 'header'),
    pressToChaptersMs: durationFromPress(trace, 'chapters'),
    pressToCompleteMs: durationFromPress(trace, 'complete'),
    mountToVisibleMs: durationBetween(trace, 'mount', 'visible'),
    mountToHeaderMs: durationBetween(trace, 'mount', 'header'),
    headerToChaptersMs: durationBetween(trace, 'header', 'chapters'),
  };
}

function logSummary(
  trace: MangaOpenTraceState,
  summary: MangaOpenSummary
): void {
  logToConsole(
    [
      `[MangaOpen] ${trace.source} content ready ${formatMs(summary.pressToCompleteMs)} from press`,
      `  mount:             ${formatMs(summary.pressToMountMs)}`,
      `  visible:           ${formatMs(summary.pressToVisibleMs)}`,
      `  hydrated:          ${formatMs(summary.pressToHydratedMs)}`,
      `  header:            ${formatMs(summary.pressToHeaderMs)}`,
      `  chapters:          ${formatMs(summary.pressToChaptersMs)}`,
      `  complete:          ${formatMs(summary.pressToCompleteMs)}`,
      `  mount → visible:   ${formatMs(summary.mountToVisibleMs)}`,
      `  mount → header:    ${formatMs(summary.mountToHeaderMs)}`,
      `  header → chapters: ${formatMs(summary.headerToChaptersMs)}`,
    ].join('\n')
  );
}

export function resetMangaOpenTraceForTests(): void {
  generation = 0;
  current = null;
}

export function startMangaOpen(
  mangaId: string,
  source: string = 'unknown'
): number {
  const id = mangaId.trim();
  const startedAt = nowMs();
  if (
    current &&
    current.mangaId === id &&
    startedAt - current.startedAt < REUSE_WINDOW_MS &&
    current.marks.complete == null
  ) {
    return current.startedAt;
  }

  generation += 1;
  current = {
    mangaId: id,
    source,
    startedAt,
    generation,
    marks: { press: startedAt },
  };
  logToConsole(`[MangaOpen] ${source} press`);
  logger().info('Navigation', 'mangaOpen:press', {
    source,
    generation,
  });
  return startedAt;
}

export function getMangaOpenStartedAt(mangaId?: string): number | null {
  if (!current) {
    return null;
  }
  if (mangaId && current.mangaId !== mangaId.trim()) {
    return null;
  }
  return current.startedAt;
}

export function markMangaOpen(
  phase: MangaOpenPhase,
  mangaId?: string
): MangaOpenSummary | null {
  if (phase === 'press' || !current) {
    return null;
  }
  if (mangaId && current.mangaId !== mangaId.trim()) {
    return null;
  }
  if (current.marks[phase] != null) {
    return phase === 'complete' ? buildSummary(current) : null;
  }

  const markedAt = nowMs();
  current.marks[phase] = markedAt;
  const durationMs = Math.round(markedAt - current.startedAt);
  reportMetric({
    name: PHASE_METRIC[phase],
    durationMs,
    route: MANGA_OPEN_ROUTE,
  });
  const phaseLabel = phase === 'visible' ? 'page visible' : phase;
  logToConsole(`[MangaOpen] ${phaseLabel} ${durationMs}ms from press`);
  logger().info('Navigation', `mangaOpen:${phase}`, {
    source: current.source,
    durationMs,
    generation: current.generation,
  });

  if (phase !== 'complete') {
    return null;
  }

  const summary = buildSummary(current);
  logSummary(current, summary);
  logger().info('Navigation', 'mangaOpen:summary', summary);
  return summary;
}
