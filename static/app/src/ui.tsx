// Small shared pieces: resolver calls, chips, traffic lights, links.
import { invoke, router } from '@forge/bridge';
import type { ReactNode } from 'react';

export type Light = 'red' | 'amber' | 'green';
export type ChipKind = 'SCAN' | 'GEN' | 'SCORE';
type Failure = { error: string };

export async function call<T>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = await invoke<T | Failure>(name, payload);
  if (r && typeof r === 'object' && 'error' in (r as object)) throw new Error((r as Failure).error);
  return r as T;
}

export const errorText = (e: unknown) => String((e as Error)?.message ?? e);

const CHIP_TITLE: Record<ChipKind, string> = {
  SCAN: 'From the anonymized scan export',
  GEN: 'Generated for the demo: pages, tickets, people',
  SCORE: 'Computed by Pentti from the scan and the generated content',
};

export function Chip({ k }: { k: ChipKind }) {
  return <span className={`chip chip-${k.toLowerCase()}`} title={CHIP_TITLE[k]}>{k}</span>;
}

/** A number with its chip. Every number on the page goes through here or sits next to a Chip. */
export function Num({ v, k, suffix }: { v: number | string | null; k: ChipKind; suffix?: string }) {
  return (
    <span className="num">
      {v === null ? 'not known' : v}
      {suffix && v !== null ? suffix : ''} <Chip k={k} />
    </span>
  );
}

const WORDS = {
  risk: { red: 'High risk', amber: 'Medium risk', green: 'Low risk' },
  danger: { red: 'High danger', amber: 'Medium danger', green: 'Low danger' },
  knowledge: { red: 'Little known', amber: 'Partly known', green: 'Well known' },
} as const;

export function Dot({ light, kind }: { light: Light; kind: keyof typeof WORDS }) {
  return <span className={`dot dot-${light}`} title={WORDS[kind][light]} aria-label={WORDS[kind][light]} />;
}

export function LightTag({ light, kind }: { light: Light; kind: keyof typeof WORDS }) {
  return (
    <span className={`light light-${light}`}>
      <Dot light={light} kind={kind} />
      {WORDS[kind][light]}
    </span>
  );
}

export function ExtLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.open(href).catch(() => undefined);
      }}
    >
      {children}
    </a>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

export const PLANT_COLORS: Record<string, string> = {
  Birch: '#2563eb',
  Spruce: '#059669',
  Rowan: '#dc6b19',
  Pine: '#9333ea',
  Alder: '#db2777',
  Annex: '#0e7490',
};
