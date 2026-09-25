import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  Clock,
  Calendar,
  Check,
  Plus,
} from 'lucide-react';
import type { Contact } from '../../types/contacts';
import {
  computeFollowUpStatus,
  formatRelationshipType,
  getRelationshipPillVariant,
  getInitials,
} from '../../types/contacts';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { Button } from '../ui/Button';

export interface ContactsTableProps {
  contacts: Contact[];
  totalCount: number;
  isLoading: boolean;
  selectedContactId: string | null;
  onSelectContact: (contact: Contact) => void;
  onNewContact: () => void;
  isManager: boolean;
  page: number;
  pageSize: number;
}

export function ContactsTable({
  contacts,
  totalCount,
  isLoading,
  selectedContactId,
  onSelectContact,
  onNewContact,
  isManager,
  page,
  pageSize,
}: ContactsTableProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Keep focusedIndex within range when contacts list changes
  useEffect(() => {
    if (contacts.length === 0) {
      setFocusedIndex(0);
    } else if (focusedIndex >= contacts.length) {
      setFocusedIndex(contacts.length - 1);
    }
  }, [contacts.length, focusedIndex]);

  // Keyboard navigation: ↑/↓ to move focus, Enter to open, 'n' to open new contact dialog
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (contacts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, contacts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (contacts[focusedIndex]) {
        onSelectContact(contacts[focusedIndex]);
      }
    } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // If not focusing an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        onNewContact();
      }
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="contacts-table-loading" role="status" aria-busy="true" style={{ padding: '24px 0' }}>
        <div className="col" style={{ gap: '8px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="row" style={{ gap: '12px', alignItems: 'center' }}>
              <Skeleton width="28px" height="28px" borderRadius="14px" />
              <Skeleton width="180px" height="20px" />
              <Skeleton width="90px" height="20px" />
              <Skeleton width="140px" height="20px" />
              <Skeleton width="100px" height="20px" />
              <div style={{ flex: 1 }} />
              <Skeleton width="80px" height="20px" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <EmptyState
        title="No contacts found"
        description="Build your network by adding recruiters, hiring managers, and referral partners."
        action={
          <Button variant="primary" onClick={onNewContact} leftIcon={<Plus size={14} />}>
            Add first contact
          </Button>
        }
      />
    );
  }

  const cols = isManager
    ? '32px minmax(0,1.5fr) 120px minmax(0,1fr) 150px 96px 150px 100px'
    : '32px minmax(0,1.5fr) 120px minmax(0,1fr) 160px 100px 160px 120px';

  const startRow = page * pageSize + 1;
  const endRow = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div
      className="contacts-table-container col"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}
      aria-label="Contacts list. Use arrow keys to navigate, Enter to open, N to create new contact."
    >
      <div className="tbl" role="grid" aria-rowcount={totalCount} style={{ width: '100%' }}>
        {/* Table header */}
        <div role="row" className="tr th" style={{ gridTemplateColumns: cols }}>
          <span
            role="columnheader"
            className={`cb ${selectedIds.size === contacts.length && contacts.length > 0 ? 'on' : ''}`}
            onClick={toggleSelectAll}
            title="Select all"
          >
            {selectedIds.size === contacts.length && contacts.length > 0 && <Check size={12} />}
          </span>
          <span role="columnheader">Name · Title</span>
          <span role="columnheader">Type</span>
          <span role="columnheader">Company</span>
          <span role="columnheader">Applications</span>
          <span role="columnheader">Last contact</span>
          <span role="columnheader">Next follow-up</span>
          <span role="columnheader">{isManager ? 'Owner' : 'Status'}</span>
        </div>

        {/* Table rows */}
        {contacts.map((c, i) => {
          const isSelected = selectedContactId === c.id;
          const isChecked = selectedIds.has(c.id);
          const isFocused = focusedIndex === i;
          const followUp = computeFollowUpStatus(c.next_follow_up_date);
          const pillVariant = getRelationshipPillVariant(c.relationship_type);
          const pillText = formatRelationshipType(c.relationship_type);
          const initials = getInitials(c.full_name);

          // Linked applications count or label
          const linkedApps = c.application_contacts || [];
          const firstApp = linkedApps[0]?.applications;
          const appText =
            linkedApps.length === 0
              ? 'Not linked'
              : linkedApps.length === 1 && firstApp
              ? `1 · ${firstApp.role_title}`
              : `${linkedApps.length} linked`;

          return (
            <div
              key={c.id}
              role="row"
              aria-selected={isSelected}
              className={`tr ${isSelected ? 'sel' : ''} ${isFocused ? 'focused' : ''}`}
              style={{
                gridTemplateColumns: cols,
                cursor: 'pointer',
                backgroundColor: isSelected ? 'var(--color-surface-hover)' : undefined,
                borderLeft: isFocused ? '3px solid var(--color-accent)' : undefined,
              }}
              onClick={() => {
                setFocusedIndex(i);
                onSelectContact(c);
              }}
            >
              {/* Checkbox */}
              <span
                role="gridcell"
                className={`cb ${isChecked ? 'on' : ''}`}
                onClick={(e) => toggleSelectRow(c.id, e)}
              >
                {isChecked && <Check size={12} />}
              </span>

              {/* Name & Title */}
              <span role="gridcell" className="row" style={{ alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span className="av" style={{ width: '26px', height: '26px', fontSize: '11px' }}>
                  {initials}
                </span>
                <span className="col" style={{ minWidth: 0, flex: 1 }}>
                  <span className="b ell" style={{ fontSize: '13px', color: 'var(--color-fg)' }}>
                    {c.full_name}
                  </span>
                  {c.job_title && (
                    <span className="small muted ell" style={{ fontSize: '11px' }}>
                      {c.job_title}
                    </span>
                  )}
                </span>
              </span>

              {/* Relationship Type Pill */}
              <span role="gridcell">
                <span className={`pill ${pillVariant === 'accent' ? 'accent' : pillVariant}`}>
                  {pillText}
                </span>
              </span>

              {/* Company */}
              <span role="gridcell" className="row ell" style={{ alignItems: 'center', gap: '6px', minWidth: 0 }}>
                {c.company_name ? (
                  <>
                    <span
                      className="tile"
                      style={{
                        width: '20px',
                        height: '20px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--color-surface-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {c.company_name[0]?.toUpperCase()}
                    </span>
                    <span className="ell" style={{ fontSize: '13px' }}>
                      {c.company_name}
                    </span>
                  </>
                ) : (
                  <span className="muted" style={{ fontStyle: 'italic', fontSize: '12px' }}>
                    None
                  </span>
                )}
              </span>

              {/* Applications */}
              <span role="gridcell" className="small ell">
                {linkedApps.length === 0 ? (
                  <span className="muted">Not linked</span>
                ) : (
                  <span>{appText}</span>
                )}
              </span>

              {/* Last contact */}
              <span role="gridcell" className="small muted">
                {c.last_contact_date
                  ? new Date(c.last_contact_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: '2-digit',
                    })
                  : '—'}
              </span>

              {/* Next follow-up badge */}
              <span role="gridcell" className="small">
                {followUp.status === 'danger' ? (
                  <span className="row danger-t b nowrap" style={{ gap: '4px', alignItems: 'center' }}>
                    <AlertTriangle size={13} />
                    {followUp.label}
                  </span>
                ) : followUp.status === 'warning' ? (
                  <span className="row warning-t b nowrap" style={{ gap: '4px', alignItems: 'center' }}>
                    <Clock size={13} />
                    {followUp.label}
                  </span>
                ) : followUp.status === 'upcoming' ? (
                  <span className="row muted nowrap" style={{ gap: '4px', alignItems: 'center' }}>
                    <Calendar size={13} />
                    {followUp.label}
                  </span>
                ) : (
                  <span className="muted" style={{ fontStyle: 'italic' }}>
                    None
                  </span>
                )}
              </span>

              {/* Status / Manager Owner */}
              <span role="gridcell" className="small ell">
                {isManager ? (
                  <span className="row" style={{ alignItems: 'center', gap: '6px' }}>
                    <span
                      className="av"
                      style={{ width: '20px', height: '20px', fontSize: '9px' }}
                    >
                      {c.user_id.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="ell muted">{c.user_id.slice(0, 8)}</span>
                  </span>
                ) : (
                  <span className="muted">
                    {c.archived_at ? 'Archived' : c.last_contact_date ? 'Active' : 'New'}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Table footer info */}
      <div
        className="tfoot row"
        style={{
          border: '1px solid var(--color-border)',
          borderTop: 0,
          borderRadius: '0 0 8px 8px',
          padding: '8px 16px',
          fontSize: '12px',
          color: 'var(--color-fg-muted)',
          alignItems: 'center',
        }}
      >
        <span>
          Rows {startRow}–{endRow} of {totalCount}
        </span>
        <div style={{ flex: 1 }} />
        <span className="muted">↑↓ move · Enter open · N new contact</span>
      </div>
    </div>
  );
}
