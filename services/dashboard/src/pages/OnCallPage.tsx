import { useEffect, useState } from 'react';
import { fetchTeamMembers, fetchTeams, type Team, type TeamMember } from '../api/directory';
import { Avatar, PageHead, Status } from '../components/ui';

type Rota = Array<{ team: Team; members: TeamMember[] }>;

const RULES = [
  ['The owning team first', 'People who own the affected service are considered before anyone else.'],
  ['Nobody on leave', 'Anyone marked on leave is left out of the scoring.'],
  ['A pair where possible', 'One senior to lead and one investigator to dig in, with fallbacks when a team is short.'],
];

function availability(member: TeamMember) {
  if (member.is_on_leave) return { tone: 'pending', label: 'On leave' } as const;
  if (member.on_call_status) return { tone: 'ok', label: 'On call' } as const;
  return { tone: 'ink', label: 'Off shift' } as const;
}

export default function OnCallPage() {
  const [rota, setRota] = useState<Rota | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchTeams()
      .then(({ teams }) =>
        Promise.all(teams.map(async (team) => ({ team, members: (await fetchTeamMembers(team.id)).members }))),
      )
      .then((result) => {
        if (active) setRota(result);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <PageHead
        kicker="never the whole channel"
        title="On-call"
        lead="Who is on call, off shift or away, as recorded in the team directory."
      />
      <p className="banner">
        <strong>Perimeter does not page anyone yet.</strong>
        The on-call router is built but not connected to alerts or to this directory.
      </p>
      {!rota && !error && <p role="status">Loading the rota…</p>}
      {error && <p className="error" role="alert">Could not load the rota.</p>}
      {rota && (
        <div className="columns">
          {rota.map(({ team, members }) => (
            <section key={team.id} className="card queue">
              <div className="card-head"><h2>{team.name}</h2></div>
              {members.length === 0 && <p className="muted">No members registered.</p>}
              <ul className="rows">
                {members.map((member) => {
                  const state = availability(member);
                  return (
                    <li key={member.user_id} className="split">
                      <div className="person">
                        <Avatar name={member.name} />
                        <div>
                          <p><strong>{member.name}</strong></p>
                          <p className="muted" style={{ textTransform: 'capitalize' }}>{member.seniority}</p>
                        </div>
                      </div>
                      <Status tone={state.tone}>{state.label}</Status>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <h2 style={{ marginTop: 56 }}>How the router picks</h2>
      <div className="steps" style={{ marginTop: 20 }}>
        {RULES.map(([title, text], i) => (
          <div key={title}>
            <span className="num">{i + 1}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
