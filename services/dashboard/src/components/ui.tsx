// Small presentational pieces shared by the pages.
import { type ReactNode, useEffect, useState } from 'react';
import { fetchTeams, type Team } from '../api/directory';

export type Tone = 'ok' | 'warn' | 'hot' | 'ink' | 'pending';

/** Status as a square mark plus words, so colour is never the only signal. */
export function Status({ tone, children, ...rest }: Readonly<{ tone: Tone; children: ReactNode; 'data-testid'?: string }>) {
  return (
    <span className={`status status-${tone}`} {...rest}>
      {children}
    </span>
  );
}

export function PageHead({ kicker, title, lead, children }: Readonly<{ kicker?: string; title: string; lead?: string; children?: ReactNode }>) {
  return (
    <header className="page-head">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children}
    </header>
  );
}

export function Avatar({ name }: Readonly<{ name: string }>) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  return <span className="avatar" aria-hidden="true">{initials}</span>;
}

/** A titled bullet list from a postmortem draft; renders nothing when there are no items. */
export function PostmortemList({ title, items }: Readonly<{ title: string; items?: string[] }>) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

/** Teams visible to the signed-in user. Names are a nicety, so a failure just leaves the list empty. */
export function useTeams(): Team[] {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    let active = true;
    fetchTeams()
      .then((res) => {
        if (active) setTeams(res.teams ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return teams;
}

export const teamName = (teams: readonly Team[], id: string | null): string =>
  teams.find((team) => team.id === id)?.name ?? id ?? 'Unassigned';
