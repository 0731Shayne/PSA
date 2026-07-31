export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="presentation">
        <path className="brand-mark-axis" d="M11 35.5h26" />
        <path className="brand-mark-bars" d="M15 34V29m6 5V23m6 11V17m6 17v-8" />
        <path className="brand-mark-curve" d="M11.5 29.5c4.3-.2 6.4-2.1 8.1-5.7 1.5-3.2 3.2-8.5 7.4-8.5 4.3 0 5.3 6.8 9.5 10.2" />
      </svg>
    </span>
  );
}
