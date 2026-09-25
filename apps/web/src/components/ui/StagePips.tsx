export interface StagePipsProps {
  stage: string;
  isClosed?: boolean;
  maxSteps?: 5 | 8;
  className?: string;
}

export function StagePips({ stage, isClosed = false, maxSteps = 8, className = '' }: StagePipsProps) {
  const s = stage.toUpperCase();
  const STAGE_ORDER_8: Record<string, number> = {
    SAVED: 1,
    PREPARING: 2,
    APPLIED: 3,
    ASSESSMENT: 4,
    RECRUITER_SCREEN: 5,
    SCREENING: 5,
    INTERVIEW: 6,
    FINAL_INTERVIEW: 7,
    OFFER: 8,
    ACCEPTED: 8,
  };

  const active8 = STAGE_ORDER_8[s] ?? 1;
  const count = maxSteps === 5
    ? (s === 'OFFER' || s === 'ACCEPTED' ? 5 : s.includes('INTERVIEW') ? 4 : s.includes('SCREEN') || s === 'ASSESSMENT' ? 3 : s === 'APPLIED' ? 2 : 1)
    : active8;
  const total = maxSteps === 5 ? 5 : 8;
  const steps = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div
      className={`pips ${isClosed ? 'closed' : ''} ${className}`}
      aria-label={`Stage progress: ${count} of ${total}`}
      role="progressbar"
      aria-valuenow={count}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      {steps.map((idx) => (
        <i key={idx} className={idx <= count ? 'on' : ''} aria-hidden="true" />
      ))}
    </div>
  );
}

export interface PriorityBarsProps {
  priority: 'low' | 'medium' | 'high' | string;
  className?: string;
}

export function PriorityBars({ priority, className = '' }: PriorityBarsProps) {
  const p = priority.toLowerCase();
  const activeCount = p === 'high' ? 3 : p === 'medium' ? 2 : 1;

  return (
    <div
      className={`pri ${className}`}
      aria-label={`Priority: ${priority}`}
      title={`Priority: ${priority}`}
    >
      <i className={activeCount >= 1 ? 'on' : ''} aria-hidden="true" />
      <i className={activeCount >= 2 ? 'on' : ''} aria-hidden="true" />
      <i className={activeCount >= 3 ? 'on' : ''} aria-hidden="true" />
    </div>
  );
}
