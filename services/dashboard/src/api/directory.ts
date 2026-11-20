import { api } from './client';

export type Seniority = 'junior' | 'mid' | 'senior' | 'lead';

export interface Team {
  id: string;
  name: string;
  description: string | null;
}

export interface TeamMember {
  user_id: string;
  name: string;
  seniority: Seniority;
  skills: string[];
  on_call_status: boolean;
  is_on_leave: boolean;
  team_id?: string;
}

export interface MemberStatusPatch {
  team_id?: string;
  is_on_leave?: boolean;
  on_call_status?: boolean;
  seniority?: Seniority;
  skills?: string[];
}

export const fetchTeams = (): Promise<{ teams: Team[] }> =>
  api<{ teams: Team[] }>('/api/v1/teams');

export const fetchTeamMembers = (teamId: string): Promise<{ members: TeamMember[] }> =>
  api<{ members: TeamMember[] }>(`/api/v1/teams/${teamId}/members`);

export const updateMemberStatus = (
  userId: string,
  patch: MemberStatusPatch
): Promise<{ member: TeamMember }> =>
  api<{ member: TeamMember }>(`/api/v1/members/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
