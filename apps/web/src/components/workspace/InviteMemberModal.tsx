import { useState, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { createWorkspaceInvitation, type CreatedInvitation } from '../../api/workspace';
import { Check, Copy, History, Link, ShieldCheck, Ticket } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onInvitationCreated?: () => void;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  workspaceId,
  onInvitationCreated,
}: InviteMemberModalProps) {
  const { addToast } = useToast();
  const [role, setRole] = useState<'USER' | 'MANAGER'>('USER');
  const [maxUses, setMaxUses] = useState<number>(10);
  const [expiresDays, setExpiresDays] = useState<number>(7);
  const [label, setLabel] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreatedInvitation | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const resetState = () => {
    setRole('USER');
    setMaxUses(10);
    setExpiresDays(7);
    setLabel('');
    setCreatedInvite(null);
    setCopiedCode(false);
    setCopiedLink(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const invite = await createWorkspaceInvitation(workspaceId, {
        role,
        max_uses: maxUses,
        expires_days: expiresDays,
        label: label.trim() || undefined,
      });
      setCreatedInvite(invite);
      onInvitationCreated?.();
      addToast({
        title: 'Invite code created',
        description: `Code ${invite.invite_code} generated successfully.`,
        type: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Failed to create invitation',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdInvite) return;
    try {
      await navigator.clipboard.writeText(createdInvite.invite_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      addToast({ title: 'Copied', description: 'Invite code copied to clipboard', type: 'info' });
    } catch {
      // fallback
    }
  };

  const handleCopyLink = async () => {
    if (!createdInvite) return;
    const url = `${window.location.origin}/#workspaces/join?code=${encodeURIComponent(createdInvite.invite_code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      addToast({ title: 'Copied link', description: 'Join link copied to clipboard', type: 'info' });
    } catch {
      // fallback
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Invite members"
      description="Create an invite code and share it privately. People enter it at Workspaces › Join after signing in."
      maxWidth={540}
      footer={
        createdInvite ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
            <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <History size={14} /> Recorded in Audit history
            </span>
            <div style={{ flex: 1 }} />
            <Button variant="primary" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
            <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} isLoading={isSubmitting}>
              Generate invite code
            </Button>
          </div>
        )
      }
    >
      {createdInvite ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            className="banner success"
            style={{
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '12px',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-success-soft)',
              border: '1px solid var(--color-success-border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                color: 'var(--color-success)',
                fontSize: '14px',
              }}
            >
              <Ticket size={16} /> Invite code created
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                className="mono"
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--color-text)',
                  padding: '4px 10px',
                  background: 'var(--color-surface-1)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {createdInvite.invite_code}
              </span>
              <div style={{ flex: 1 }} />
              <Button size="sm" variant="secondary" onClick={handleCopyCode}>
                {copiedCode ? <Check size={14} className="success-t" /> : <Copy size={14} />}
                <span>{copiedCode ? 'Copied' : 'Copy code'}</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCopyLink}>
                {copiedLink ? <Check size={14} className="success-t" /> : <Link size={14} />}
                <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
              </Button>
            </div>
            <div className="small muted" style={{ fontSize: '12px' }}>
              You won't see the full code again. Revoke it anytime from Pending invites.
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField
            label="Join as"
            helpText={role === 'MANAGER' ? 'Managers get full access to all records.' : 'Users see only their own records.'}
          >
            {() => (
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  background: 'var(--color-surface-2)',
                  padding: '3px',
                  borderRadius: 'var(--radius-md)',
                  width: 'fit-content',
                }}
              >
                <button
                  type="button"
                  onClick={() => setRole('USER')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: 0,
                    background: role === 'USER' ? 'var(--color-surface-1)' : 'transparent',
                    color: role === 'USER' ? 'var(--color-text)' : 'var(--color-text-muted)',
                    fontWeight: role === 'USER' ? 600 : 400,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: role === 'USER' ? 'var(--shadow-xs)' : 'none',
                  }}
                >
                  User
                </button>
                <button
                  type="button"
                  onClick={() => setRole('MANAGER')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: 0,
                    background: role === 'MANAGER' ? 'var(--color-surface-1)' : 'transparent',
                    color: role === 'MANAGER' ? 'var(--color-text)' : 'var(--color-text-muted)',
                    fontWeight: role === 'MANAGER' ? 600 : 400,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: role === 'MANAGER' ? 'var(--shadow-xs)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <ShieldCheck size={14} />
                  Manager
                </button>
              </div>
            )}
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Uses">
              {({ id }) => (
                <Select
                  id={id}
                  value={String(maxUses)}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                >
                  <option value="1">1 person</option>
                  <option value="5">Up to 5 people</option>
                  <option value="10">Up to 10 people</option>
                  <option value="25">Up to 25 people</option>
                  <option value="50">Up to 50 people</option>
                  <option value="100">Up to 100 people</option>
                </Select>
              )}
            </FormField>

            <FormField label="Expires">
              {({ id }) => (
                <Select
                  id={id}
                  value={String(expiresDays)}
                  onChange={(e) => setExpiresDays(Number(e.target.value))}
                >
                  <option value="1">In 24 hours</option>
                  <option value="7">In 7 days</option>
                  <option value="14">In 14 days</option>
                  <option value="30">In 30 days</option>
                </Select>
              )}
            </FormField>
          </div>

          <FormField label="Label" optional helpText="Used to identify this batch in pending invites and audit logs">
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. Cohort 7 spring intake"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            )}
          </FormField>
        </form>
      )}
    </Dialog>
  );
}
