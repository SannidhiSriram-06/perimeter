import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  fetchTeamMembers,
  fetchTeams,
  updateMemberStatus,
  type MemberStatusPatch,
  type Seniority,
  type Team,
  type TeamMember,
} from '../../api/directory';
import { Avatar, PageHead } from '../../components/ui';

const SENIORITY_LEVELS: Seniority[] = ['junior', 'mid', 'senior', 'lead'];

interface MembersViewProps {
  loading: boolean;
  members: TeamMember[];
  onToggleOnCall: (member: TeamMember) => void;
  onRequestLeaveToggle: (member: TeamMember) => void;
  onStartEditing: (member: TeamMember) => void;
}

function MembersTable({
  loading,
  members,
  onToggleOnCall,
  onRequestLeaveToggle,
  onStartEditing,
}: MembersViewProps) {
  if (loading) {
    return <p>Loading team members...</p>;
  }

  if (members.length === 0) {
    return <p>No members registered for this team.</p>;
  }

  return (
    <div className="card flush scroll">
      <table style={{ minWidth: 860 }}>
        <thead>
          <tr>
            <th>Member</th>
            <th>Seniority</th>
            <th>Skills</th>
            <th>On call</th>
            <th>On leave</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>
                <div className="person">
                  <Avatar name={m.name} />
                  <div>
                    <p><strong>{m.name}</strong></p>
                    <p className="mono muted">{m.user_id}</p>
                  </div>
                </div>
              </td>
              <td style={{ textTransform: 'capitalize' }}>{m.seniority}</td>
              <td className="muted">
                {m.skills && m.skills.length > 0 ? (
                  <ul className="chips">
                    {m.skills.map((s) => (
                      <li key={s} className="mono">{s}</li>
                    ))}
                  </ul>
                ) : (
                  <em>None</em>
                )}
              </td>
              <td>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={m.on_call_status}
                    onChange={() => onToggleOnCall(m)}
                    aria-label={`Toggle on-call for ${m.name}`}
                  />
                  {m.on_call_status ? 'On call' : 'Off shift'}
                </label>
              </td>
              <td>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={m.is_on_leave}
                    onChange={() => onRequestLeaveToggle(m)}
                    aria-label={`Toggle leave for ${m.name}`}
                  />
                  {m.is_on_leave ? 'On leave' : 'Available'}
                </label>
              </td>
              <td>
                <button type="button" onClick={() => onStartEditing(m)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DirectoryPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Leave confirmation state
  const [leaveConfirmMember, setLeaveConfirmMember] = useState<TeamMember | null>(null);

  // Edit member dialog state
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editSeniority, setEditSeniority] = useState<Seniority>('mid');
  const [editSkillsText, setEditSkillsText] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchTeams()
      .then(({ teams: fetchedTeams }) => {
        if (!active) return;
        setTeams(fetchedTeams);
        if (fetchedTeams.length > 0) {
          setSelectedTeamId(fetchedTeams[0].id);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load teams');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;

    let active = true;
    setMembersLoading(true);
    setError(null);

    void fetchTeamMembers(selectedTeamId)
      .then(({ members: fetchedMembers }) => {
        if (!active) return;
        setMembers(fetchedMembers);
        setMembersLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load team members');
        setMembersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedTeamId]);

  const handlePatch = async (userId: string, patch: MemberStatusPatch) => {
    setError(null);
    setSuccessMessage(null);
    try {
      const patchWithTeam: MemberStatusPatch = {
        ...patch,
        team_id: patch.team_id || selectedTeamId,
      };

      const { member: updated } = await updateMemberStatus(userId, patchWithTeam);

      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                seniority: updated.seniority,
                skills: updated.skills,
                on_call_status: updated.on_call_status,
                is_on_leave: updated.is_on_leave,
              }
            : m
        )
      );
      setSuccessMessage(`Updated status for user ${userId}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`Conflict (409): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to update member status');
      }
    }
  };

  const toggleOnCall = (member: TeamMember) => {
    void handlePatch(member.user_id, {
      on_call_status: !member.on_call_status,
      team_id: selectedTeamId,
    });
  };

  const requestLeaveToggle = (member: TeamMember) => {
    if (!member.is_on_leave) {
      setLeaveConfirmMember(member);
    } else {
      void handlePatch(member.user_id, {
        is_on_leave: false,
        team_id: selectedTeamId,
      });
    }
  };

  const confirmMarkLeave = () => {
    if (!leaveConfirmMember) return;
    const member = leaveConfirmMember;
    setLeaveConfirmMember(null);
    void handlePatch(member.user_id, {
      is_on_leave: true,
      team_id: selectedTeamId,
    });
  };

  const startEditing = (member: TeamMember) => {
    setEditingMember(member);
    setEditSeniority(member.seniority);
    setEditSkillsText((member.skills || []).join(', '));
  };

  const saveEdit = async () => {
    if (!editingMember) return;
    setSavingEdit(true);

    const parsedSkills = editSkillsText
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    await handlePatch(editingMember.user_id, {
      seniority: editSeniority,
      skills: parsedSkills,
      team_id: selectedTeamId,
    });

    setSavingEdit(false);
    setEditingMember(null);
  };

  if (loading) {
    return (
      <section>
        <PageHead title="Team Directory & Leave Management" />
        <p>Loading teams and directory...</p>
      </section>
    );
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <section>
      <PageHead
        kicker="who is here, and who is away"
        title="Team Directory & Leave Management"
        lead="Manage team member assignments, toggle on-call availability, and mark scheduled leaves."
      />

      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}

      {successMessage && <output className="success">✓ {successMessage}</output>}

      {/* Team Selection Tabs */}
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Teams">
          {teams.map((t) => (
            <button key={t.id} type="button" aria-pressed={selectedTeamId === t.id} onClick={() => setSelectedTeamId(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {selectedTeam && (
        <div className="card-head">
          <h2>{selectedTeam.name}</h2>
          {selectedTeam.description && <p>{selectedTeam.description}</p>}
        </div>
      )}

      {/* Members Table component */}
      <MembersTable
        loading={membersLoading}
        members={members}
        onToggleOnCall={toggleOnCall}
        onRequestLeaveToggle={requestLeaveToggle}
        onStartEditing={startEditing}
      />

      {/* Confirmation Modal Before Marking Someone On Leave */}
      {leaveConfirmMember && (
        <dialog open aria-labelledby="confirm-leave-title" className="overlay">
          <div className="card">
            <div className="card-head">
              <h2 id="confirm-leave-title">Confirm Leave Marking</h2>
            </div>
            <p>
              Are you sure you want to mark <strong>{leaveConfirmMember.name}</strong> (ID:{' '}
              {leaveConfirmMember.user_id}) as <strong>ON LEAVE</strong>?
            </p>
            <p className="muted">
              Engineers on leave are strictly excluded from the on-call scoring engine and will not receive incident
              pages.
            </p>
            <div className="actions end">
              <button type="button" onClick={() => setLeaveConfirmMember(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={confirmMarkLeave}>
                Confirm Leave
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Edit Seniority & Skills Modal */}
      {editingMember && (
        <dialog open aria-labelledby="edit-member-title" className="overlay">
          <div className="card">
            <div className="card-head">
              <h2 id="edit-member-title">
                Edit Member: {editingMember.name} ({editingMember.user_id})
              </h2>
            </div>
            <div className="stack tight">
              <label>
                <span>Seniority:</span>
                <select value={editSeniority} onChange={(e) => setEditSeniority(e.target.value as Seniority)}>
                  {SENIORITY_LEVELS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Skills (comma-separated):</span>
                <input
                  type="text"
                  value={editSkillsText}
                  onChange={(e) => setEditSkillsText(e.target.value)}
                  placeholder="python, postgresql, distributed-systems"
                />
                <small className="muted">Lowercase letters, digits and hyphens (e.g., python, fastapi).</small>
              </label>
            </div>

            <div className="actions end">
              <button type="button" onClick={() => setEditingMember(null)} disabled={savingEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  void saveEdit();
                }}
                disabled={savingEdit}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
