import { useState, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { setGoal } from '../../api/analytics';
import { useToast } from '../../context/ToastContext';
import type { GoalPeriod, GoalProgressPoint, GoalType } from '../../types/analytics';

interface EditGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentGoal: GoalProgressPoint | null;
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
  const [goalType, setGoalType] = useState<GoalType>(currentGoal?.goal_type ?? 'APPLICATIONS');
  const [targetValue, setTargetValue] = useState(currentGoal?.target_value ?? 10);
  const [periodType, setPeriodType] = useState<GoalPeriod>(currentGoal?.period_type ?? 'WEEKLY');
  const [effectiveDate, setEffectiveDate] = useState(
    currentGoal?.effective_date ?? new Date().toLocaleDateString('en-CA'),
  );
  const [isEnabled, setIsEnabled] = useState(currentGoal?.is_enabled ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (targetValue < 1) {
      addToast({ type: 'danger', title: 'Goal target must be at least 1' });
      return;
    }
    try {
      setIsSubmitting(true);
      await setGoal(workspaceId, {
        goalType,
        targetValue,
        periodType,
        effectiveDate,
        isEnabled,
        userId: targetUserId,
      });
      addToast({ type: 'success', title: 'Goal updated successfully' });
      onGoalUpdated();
      onClose();
    } catch (cause) {
      addToast({ type: 'danger', title: (cause as Error).message || 'Failed to update goal' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={currentGoal ? 'Edit goal' : 'Add goal'}>
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="goal-type">Goal</label>
          <Select id="goal-type" value={goalType} onChange={(event) => setGoalType(event.target.value as GoalType)} disabled={Boolean(currentGoal)}>
            <option value="APPLICATIONS">Applications</option>
            <option value="NETWORKING">Networking interactions</option>
            <option value="FOLLOW_UPS">Completed follow-ups</option>
            <option value="INTERVIEW_PREP">Interview prep sessions</option>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">Interview prep counts one interview-prep journal entry as one session.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="goal-target">Target</label>
          <Input id="goal-target" type="number" min={1} max={100000} value={targetValue} onChange={(event) => setTargetValue(Number.parseInt(event.target.value, 10) || 0)} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="goal-period">Period</label>
          <Select id="goal-period" value={periodType} onChange={(event) => setPeriodType(event.target.value as GoalPeriod)}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="goal-effective">Effective from</label>
          <Input id="goal-effective" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} required />
          <p className="text-[11px] text-muted-foreground mt-1">Closed periods are immutable; choose today or a future date.</p>
        </div>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
          Active goal
        </label>
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save goal'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
