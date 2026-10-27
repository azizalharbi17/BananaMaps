'use client';
import type { BillingInterval } from '@/lib/plans';

/** Monthly / yearly switch; yearly shows the "2 months free" tag. */
export default function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  return (
    <div className="dev-toggle" role="group" aria-label="Billing interval">
      <button type="button" aria-pressed={value === 'month'} onClick={() => onChange('month')}>Monthly</button>
      <button type="button" aria-pressed={value === 'year'} onClick={() => onChange('year')}>
        Yearly <span className="dev-save">2 months free</span>
      </button>
    </div>
  );
}
