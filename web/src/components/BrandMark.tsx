export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="presentation">
        <path className="brand-mark-axis" d="M9.5 36.5h29M12 39V10" />
        <path className="brand-mark-bars" d="M16 35v-5m6 5V24m6 11V17m6 18v-9" />
        <path className="brand-mark-curve" d="M10.5 32c5.2-.1 7.5-1.8 9.5-6.3 1.8-4.1 3.7-10.4 8.2-10.4 4.7 0 5.8 8.2 10.1 12.2" />
        <circle className="brand-mark-point" cx="28.2" cy="15.3" r="2.15" />
      </svg>
    </span>
  );
}
