import { type ChangeEvent } from 'react';
import {
  Search,
  Download,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  Company,
  ContactSort,
  ContactSortField,
} from '../../types/contacts';
import { Button } from '../ui/Button';

export interface ContactsToolbarProps {
  search: string;
  onSearchChange: (val: string) => void;
  selectedTab: string;
  onTabChange: (tab: string) => void;
  counts: {
    all: number;
    followUpDue: number;
    recruiters: number;
    hiringManagers: number;
    referrals: number;
    interviewers: number;
    networking: number;
  };
  companies: Company[];
  companyFilter: string;
  onCompanyFilterChange: (co: string) => void;
  isManager: boolean;
  ownerFilter?: string;
  onOwnerFilterChange: (uid?: string) => void;
  workspaceMembers: Array<{ user_id: string; username: string; role: string }>;
  sort: ContactSort;
  onSortChange: (sort: ContactSort) => void;
  onNewContact: () => void;
  onExport: () => void;
  archiveState: 'active' | 'archived' | 'all';
  onArchiveStateChange: (state: 'active' | 'archived' | 'all') => void;
}

export function ContactsToolbar({
  search,
  onSearchChange,
  selectedTab,
  onTabChange,
  counts,
  companies,
  companyFilter,
  onCompanyFilterChange,
  isManager,
  ownerFilter,
  onOwnerFilterChange,
  workspaceMembers,
  sort,
  onSortChange,
  onNewContact,
  onExport,
  archiveState,
  onArchiveStateChange,
}: ContactsToolbarProps) {
  const tabs = [
    { key: 'ALL', label: 'All', count: counts.all, isDanger: false },
    {
      key: 'FOLLOW_UP_DUE',
      label: 'Follow-up due',
      count: counts.followUpDue,
      isDanger: counts.followUpDue > 0,
    },
    { key: 'RECRUITER', label: 'Recruiters', count: counts.recruiters, isDanger: false },
    { key: 'HIRING_MANAGER', label: 'Hiring managers', count: counts.hiringManagers, isDanger: false },
    { key: 'REFERRAL', label: 'Referrals', count: counts.referrals, isDanger: false },
    { key: 'INTERVIEWER', label: 'Interviewers', count: counts.interviewers, isDanger: false },
    { key: 'CONTACT', label: 'Networking', count: counts.networking, isDanger: false },
  ];

  const handleSortField = (e: ChangeEvent<HTMLSelectElement>) => {
    const field = e.target.value as ContactSortField;
    onSortChange({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  return (
    <div className="contacts-toolbar col" style={{ gap: '10px' }}>
      {/* Top row: Page title, counts & actions */}
      <div className="page-title row" style={{ alignItems: 'center', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Contacts</h1>
        <span className="muted small">
          {isManager
            ? `${counts.all} across ${workspaceMembers.length || 1} members`
            : `${counts.all} contacts`}
        </span>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onExport} leftIcon={<Download size={14} />}>
          Export
        </Button>
        <Button variant="primary" onClick={onNewContact} leftIcon={<UserPlus size={14} />}>
          New contact
        </Button>
      </div>

      {/* Tabs list matching 03-contacts.html */}
      <div className="tabs" role="tablist">
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isSelected}
              className={`tab ${isSelected ? 'sel' : ''}`}
              onClick={() => onTabChange(tab.key)}
              type="button"
            >
              {tab.label}
              <span className={`cnt ${tab.isDanger ? 'danger' : ''}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and search controls */}
      <div className="row" style={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Search input */}
        <div className="input ph row" style={{ width: '240px', height: '32px', alignItems: 'center', gap: '6px' }}>
          <Search size={14} className="muted" />
          <input
            type="text"
            placeholder="Filter contacts..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: '13px',
              color: 'var(--color-fg)',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
            >
              <X size={12} className="muted" />
            </button>
          )}
        </div>

        {/* Company filter dropdown */}
        <select
          aria-label="Filter by company"
          value={companyFilter}
          onChange={(e) => onCompanyFilterChange(e.target.value)}
          className="chip"
          style={{ height: '32px', fontSize: '12px', background: 'var(--color-surface)', cursor: 'pointer' }}
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Manager owner filter */}
        {isManager && (
          <select
            aria-label="Filter by owner"
            value={ownerFilter || ''}
            onChange={(e) => onOwnerFilterChange(e.target.value || undefined)}
            className="chip"
            style={{ height: '32px', fontSize: '12px', background: 'var(--color-surface)', cursor: 'pointer' }}
          >
            <option value="">Owner: All members</option>
            {workspaceMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                Owner: {m.username} ({m.role})
              </option>
            ))}
          </select>
        )}

        {/* Archive toggle */}
        <select
          aria-label="Filter archive state"
          value={archiveState}
          onChange={(e) => onArchiveStateChange(e.target.value as 'active' | 'archived' | 'all')}
          className="chip"
          style={{ height: '32px', fontSize: '12px', background: 'var(--color-surface)', cursor: 'pointer' }}
        >
          <option value="active">Active contacts</option>
          <option value="archived">Archived contacts</option>
          <option value="all">All (active & archived)</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Sort dropdown */}
        <div className="row" style={{ alignItems: 'center', gap: '4px' }}>
          <span className="small muted">Sort</span>
          <select
            aria-label="Sort contacts"
            value={sort.field}
            onChange={handleSortField}
            className="chip"
            style={{ height: '32px', fontSize: '12px', background: 'var(--color-surface)', cursor: 'pointer' }}
          >
            <option value="next_follow_up_date">Next follow-up {sort.field === 'next_follow_up_date' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</option>
            <option value="full_name">Name {sort.field === 'full_name' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</option>
            <option value="company_name">Company {sort.field === 'company_name' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</option>
            <option value="last_contact_date">Last contact {sort.field === 'last_contact_date' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</option>
            <option value="created_at">Date added {sort.field === 'created_at' ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
