import { useEffect, useRef, useState } from 'react';

export interface PreDispatchHoldProps {
  durationMs?: number;
  contactName?: string;
  onCancel: () => void;
  onComplete: () => void;
}

export function PreDispatchHold({
  durationMs = 5000,
  contactName,
  onCancel,
  onComplete,
}: PreDispatchHoldProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const startTimeRef = useRef<number>(Date.now());
  const completedRef = useRef(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
    completedRef.current = false;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, durationMs - elapsed);
      setRemainingMs(remaining);

      if (remaining === 0 && !completedRef.current) {
        completedRef.current = true;
        clearInterval(interval);
        onComplete();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onComplete]);

  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const progressPercent = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100));

  return (
    <div
      role="region"
      aria-label="Pre-dispatch hold"
      data-testid="pre-dispatch-hold"
      className="w-full bg-amber-50 border border-amber-200 rounded-none-none p-3.5 space-y-2.5 -xs"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs text-amber-900 font-semibold">
          <span className="inline-block w-2 h-2 rounded-none-full bg-amber-500 animate-ping" />
          <span aria-live="polite">
            Sending {contactName ? `to ${contactName} ` : ''}in {remainingSeconds}s...
          </span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] sm:min-h-[44px] px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-none-none  focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
        >
          Cancel Send
        </button>
      </div>

      {/* Depleting progress bar */}
      <div
        className="w-full h-1.5 bg-amber-200/60 rounded-none-full overflow-hidden"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-amber-500   ease-linear rounded-none-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
