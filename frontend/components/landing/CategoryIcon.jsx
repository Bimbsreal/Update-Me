export function CategoryIcon({ name, className = 'h-5 w-5' }) {
  const props = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (name) {
    case 'traffic':
      return (
        <svg {...props}>
          <path d="M5 16h14l-1.2-6.2A2 2 0 0 0 15.85 8H8.15a2 2 0 0 0-1.95 1.8L5 16Z" />
          <path d="M7 16v2M17 16v2M8 11h8" />
          <circle cx="8.5" cy="16" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="16" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'fuel':
      return (
        <svg {...props}>
          <path d="M7 20V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14" />
          <path d="M6 20h10M15 10h2.5a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2" />
        </svg>
      );
    case 'transport':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="12" rx="2" />
          <path d="M4 12h16M8 20h.01M16 20h.01M7 16v4M17 16v4" />
        </svg>
      );
    case 'prices':
      return (
        <svg {...props}>
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
          <path d="M3 4h2l2.4 11h10.2l2-7H7" />
        </svg>
      );
    case 'directions':
      return (
        <svg {...props}>
          <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case 'alerts':
      return (
        <svg {...props}>
          <path d="M12 3 2.5 20h19L12 3Z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
      );
    default:
      return null;
  }
}
