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
    <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #dde0e4' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #dde0e4' }}>
            <th style={{ padding: '12px 16px' }}>User ID</th>
            <th style={{ padding: '12px 16px' }}>Name</th>
            <th style={{ padding: '12px 16px' }}>Seniority</th>
            <th style={{ padding: '12px 16px' }}>Skills</th>
            <th style={{ padding: '12px 16px' }}>On-Call Status</th>
            <th style={{ padding: '12px 16px' }}>Leave Status</th>
            <th style={{ padding: '12px 16px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{m.user_id}</td>
              <td style={{ padding: '12px 16px', fontWeight: 500 }}>{m.name}</td>
              <td style={{ padding: '12px 16px' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#e0e7ff',
                    color: '#3730a3',
                    textTransform: 'capitalize',
                  }}
                >
                  {m.seniority}
                </span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {m.skills && m.skills.length > 0 ? (
                    m.skills.map((s) => (
                      <span
                        key={s}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#f3f4f6',
                          color: '#374151',
                          fontSize: '12px',
                        }}
                      >
                        {s}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>None</span>
                  )}
                </div>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <button
                  type="button"
                  onClick={() => onToggleOnCall(m)}
                  aria-label={`Toggle on-call for ${m.name}`}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: m.on_call_status ? '#dcfce7' : '#f3f4f6',
                    color: m.on_call_status ? '#15803d' : '#6b7280',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {m.on_call_status ? '● On Call' : '○ Off Call'}
                </button>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <button
                  type="button"
                  onClick={() => onRequestLeaveToggle(m)}
                  aria-label={`Toggle leave for ${m.name}`}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: 'none',
                    background: m.is_on_leave ? '#fee2e2' : '#f3f4f6',
                    color: m.is_on_leave ? '#b91c1c' : '#374151',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {m.is_on_leave ? '🏖 On Leave' : 'Active'}
                </button>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <button
                  type="button"
                  onClick={() => onStartEditing(m)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #dde0e4',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
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
      <section className="content">
        <h2>Team Directory & Leave Management</h2>
        <p>Loading teams and directory...</p>
      </section>
    );
  }

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <section className="content">
      <h2>Team Directory & Leave Management</h2>
      <p style={{ color: '#4b5563', marginBottom: '1.5rem' }}>
        Manage team member assignments, toggle on-call availability, and mark scheduled leaves.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #f87171',
            color: '#b91c1c',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <output
          style={{
            display: 'block',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#15803d',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          ✓ {successMessage}
        </output>
      )}

      {/* Team Selection Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #dde0e4', paddingBottom: '8px' }}>
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedTeamId(t.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: selectedTeamId === t.id ? '2px solid #2563eb' : '1px solid #dde0e4',
              background: selectedTeamId === t.id ? '#eff6ff' : '#ffffff',
              color: selectedTeamId === t.id ? '#1d4ed8' : '#374151',
              fontWeight: selectedTeamId === t.id ? 600 : 400,
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {selectedTeam && (
        <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 4px 0' }}>{selectedTeam.name}</h3>
          {selectedTeam.description && (
            <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>{selectedTeam.description}</p>
          )}
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
        <dialog
          open
          aria-labelledby="confirm-leave-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '450px',
              width: '90%',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 id="confirm-leave-title" style={{ marginTop: 0, color: '#b91c1c' }}>
              Confirm Leave Marking
            </h3>
            <p>
              Are you sure you want to mark <strong>{leaveConfirmMember.name}</strong> (ID:{' '}
              {leaveConfirmMember.user_id}) as <strong>ON LEAVE</strong>?
            </p>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              Engineers on leave are strictly excluded from the on-call scoring engine and will not receive incident
              pages.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setLeaveConfirmMember(null)}
                style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid #dde0e4', background: '#fff' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMarkLeave}
                style={{
                  padding: '8px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                Confirm Leave
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Edit Seniority & Skills Modal */}
      {editingMember && (
        <dialog
          open
          aria-labelledby="edit-member-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 id="edit-member-title" style={{ marginTop: 0 }}>
              Edit Member: {editingMember.name} ({editingMember.user_id})
            </h3>
            <div style={{ display: 'grid', gap: '16px' }}>
              <label>
                <span>Seniority:</span>
                <select
                  value={editSeniority}
                  onChange={(e) => setEditSeniority(e.target.value as Seniority)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dde0e4' }}
                >
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
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dde0e4' }}
                />
                <small style={{ color: '#6b7280' }}>
                  Lowercase letters, digits and hyphens (e.g., python, fastapi).
                </small>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                disabled={savingEdit}
                style={{ padding: '8px 14px', borderRadius: '4px', border: '1px solid #dde0e4', background: '#fff' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveEdit();
                }}
                disabled={savingEdit}
                style={{
                  padding: '8px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 600,
                }}
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
