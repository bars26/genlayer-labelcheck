/** LabelCheck mark: a nutrition label with its heavy rule and a highlighted line, under a magnifier. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="LabelCheck">
      <rect width="32" height="32" rx="7" fill="#121212" />
      <rect x="6" y="5.5" width="15.5" height="21" rx="1.4" fill="#FFFFFF" />
      <rect x="8.2" y="8.2" width="11.1" height="2.4" fill="#121212" />
      <rect x="8.2" y="12.6" width="11.1" height="1.1" fill="#121212" />
      <rect x="8.2" y="15.6" width="8" height="1.1" fill="#121212" />
      <rect x="8.2" y="18.6" width="9.6" height="2.6" fill="#FFE14D" />
      <circle cx="21.6" cy="20.6" r="4.6" fill="none" stroke="#FFE14D" strokeWidth="2.2" />
      <path d="m24.9 23.9 3.2 3.2" stroke="#FFE14D" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
