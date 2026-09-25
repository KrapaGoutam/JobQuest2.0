import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { upsertGoal } from '../../api/analytics';
import { useToast } from '../../context/ToastContext';
import type { ActiveGoal } from '../../types/analytics';

interface EditGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentGoal: ActiveGoal | null;
  targetUserId?: string | null;
  onGoalUpdated: () => void;
}

export function EditGoalModal({
  isOpen,
  onClose,
  workspaceId,
  currentGoal,
  targetUserId,
  onGoalUpdated,
}: EditGoalModalProps) {
  const { addToast } = useToast();
  const [targetApps, setTargetApps] = useState<number>(currentGoal?.target_applications ?? 15);
  const [targetOutreach, setTargetOutreach] = useState<number>(currentGoal?.target_outreach ?? 5);
  const [effectiveDate, setEffectiveDate] = useState<string>(
    currentGoal?.effective_date ?? (new Date().toISOString().split('T')[0] as string)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetApps < 1) {
      addToast({ type: 'danger', title: 'Applications target must be at least 1' });
      return;
    }

    try {
      setIsSubmitting(true);
      await upsertGoal(workspaceId, {
        periodType: 'WEEKLY',
        targetApplications: targetApps,
        targetOutreach: targetOutreach,
        effectiveDate,
        userId: targetUserId,
      });
      addToast({ type: 'success', title: 'Search goals updated successfully' });
      onGoalUpdated();
      onClose();
    } catch (err: unknown) {
      addToast({ type: 'danger', title: (err as Error).message || 'Failed to update goal' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Edit Weekly Search Goals">
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Weekly Applications Target
          </label>
          <Input
            type="number"
            min={1}
            max={200}
            value={targetApps}
            onChange={(e) => setTargetApps(parseInt(e.target.value) || 0)}
            required
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Recommended: 10–20 applications per week for active search.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Weekly Follow-ups &amp; Outreach Target
          </label>
          <Input
            type="number"
            min={0}
            max={200}
            value={targetOutreach}
            onChange={(e) => setTargetOutreach(parseInt(e.target.value) || 0)}
            required
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Recruiter messages, network connections, and application follow-ups.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Effective From
          </label>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            required
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Past weeks are frozen snapshots; new target applies from chosen date.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Goals'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
