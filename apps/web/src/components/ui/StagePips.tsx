export interface StagePipsProps {
  stage: string;
  isClosed?: boolean;
  className?: string;
}

export function StagePips({ stage, isClosed = false, className = '' }: StagePipsProps) {
  // Map stage to 1..5 active pips
  // 1: Saved / Preparing
  // 2: Applied
  // 3: Screening
  // 4: Interview
  // 5: Offer / Accepted
  const s = stage.toUpperCase();
  let activeCount = 1;
  if (s === 'OFFER' || s === 'ACCEPTED') activeCount = 5;
  else if (s === 'INTERVIEW') activeCount = 4;
  else if (s === 'SCREENING') activeCount = 3;
  else if (s === 'APPLIED') activeCount = 2;
  else activeCount = 1;

  return (
    <div
      className={`pips ${isClosed ? 'closed' : ''} ${className}`}
      aria-label={`Stage progress: ${activeCount} of 5`}
      role="progressbar"
      aria-valuenow={activeCount}
      aria-valuemin={1}
      aria-valuemax={5}
    >
      {[1, 2, 3, 4, 5].map((idx) => (
        <i key={idx} className={idx <= activeCount ? 'on' : ''} aria-hidden="true" />
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
