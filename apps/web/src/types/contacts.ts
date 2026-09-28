export type ContactRelationshipType =
  | 'RECRUITER'
  | 'HIRING_MANAGER'
  | 'REFERRAL'
  | 'INTERVIEWER'
  | 'PEER'
  | 'CONTACT';

export type ContactInteractionType =
  | 'EMAIL'
  | 'CALL'
  | 'LINKEDIN'
  | 'MEETING'
  | 'COFFEE'
  | 'NOTE';

export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  domain: string | null;
  website?: string | null;
  website_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactInteraction {
  id: string;
  workspace_id: string;
  user_id: string;
  contact_id: string;
  interaction_type: ContactInteractionType;
  interaction_date: string;
  notes: string | null;
  created_at: string;
}

export interface ApplicationContactJoin {
  application_id: string;
  contact_id: string;
  workspace_id: string;
  role_in_process: string | null;
  created_at: string;
  applications?: {
    id: string;
    company_name: string;
    role_title: string;
    stage: string;
    status: string;
  } | null;
  contacts?: Contact | null;
}

export interface Contact {
  id: string;
  workspace_id: string;
  user_id: string;
  full_name: string;
  relationship_type: ContactRelationshipType;
  company_id: string | null;
  company_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  tags: string[];
  /** Derived client-side from the most recent interaction; there is no stored column. */
  last_contact_at?: string | null;
  next_follow_up_date: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Related joined rows
  companies?: Company | null;
  application_contacts?: ApplicationContactJoin[] | null;
  contact_interactions?: ContactInteraction[] | null;
}

/** Fields a client may change with a direct update (hybrid boundary; archive/ownership go through RPCs). */
export const CONTACT_EDITABLE_FIELDS = [
  'full_name',
  'relationship_type',
  'company_name',
  'job_title',
  'email',
  'phone',
  'linkedin_url',
  'notes',
  'tags',
  'next_follow_up_date',
] as const;
export type ContactUpdate = Partial<Pick<Contact, (typeof CONTACT_EDITABLE_FIELDS)[number]>>;

/** Columns searched by the contacts list (see buildSearchFilter). */
export const CONTACT_SEARCH_COLUMNS = ['full_name', 'company_name', 'email', 'job_title'] as const;

export interface ContactFilters {
  relationshipType?: ContactRelationshipType | 'ALL';
  company?: string;
  followUpDueOnly?: boolean;
  archiveState?: 'active' | 'archived' | 'all';
  ownerId?: string;
  search?: string;
}

export type ContactSortField =
  | 'full_name'
  | 'company_name'
  | 'relationship_type'
  | 'next_follow_up_date'
  | 'created_at';

export interface ContactSort {
  field: ContactSortField;
  direction: 'asc' | 'desc';
}

export interface ContactFollowUpStatus {
  status: 'danger' | 'warning' | 'upcoming' | 'none';
  label: string;
  rawDate: string | null;
}

export function computeFollowUpStatus(dateStr: string | null): ContactFollowUpStatus {
  if (!dateStr) return { status: 'none', label: 'None', rawDate: null };

  const cleanDate = dateStr.includes('T') ? (dateStr.split('T')[0] ?? '') : dateStr;
  const parts = cleanDate.split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return { status: 'none', label: 'None', rawDate: null };
  }

  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  target.setHours(0, 0, 0, 0);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const formatShort = (d: Date) => {
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
  };

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      status: 'danger',
      label: `${overdueDays}d overdue`,
      rawDate: dateStr,
    };
  } else if (diffDays === 0) {
    return {
      status: 'warning',
      label: 'Today',
      rawDate: dateStr,
    };
  } else if (diffDays === 1) {
    return {
      status: 'upcoming',
      label: 'Tomorrow',
      rawDate: dateStr,
    };
  } else {
    return {
      status: 'upcoming',
      label: formatShort(target),
      rawDate: dateStr,
    };
  }
}

export function formatRelationshipType(type: ContactRelationshipType): string {
  switch (type) {
    case 'RECRUITER':
      return 'Recruiter';
    case 'HIRING_MANAGER':
      return 'Hiring manager';
    case 'REFERRAL':
      return 'Referral';
    case 'INTERVIEWER':
      return 'Interviewer';
    case 'PEER':
      return 'Peer';
    case 'CONTACT':
      return 'Networking';
    default:
      return type;
  }
}

export function getRelationshipPillVariant(type: ContactRelationshipType): 'info' | 'accent' | 'success' | 'muted' {
  switch (type) {
    case 'RECRUITER':
      return 'info';
    case 'HIRING_MANAGER':
      return 'accent';
    case 'REFERRAL':
      return 'success';
    case 'INTERVIEWER':
    case 'PEER':
    case 'CONTACT':
    default:
      return 'muted';
  }
}

export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] || '').slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] || '';
  const last = parts[parts.length - 1]?.[0] || '';
  return (first + last).toUpperCase() || '??';
}
