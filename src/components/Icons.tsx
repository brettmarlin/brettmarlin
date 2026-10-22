type P = { className?: string; size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const, 'aria-hidden': true });

export const Arrow = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><path d="M4 12h15M13 5l7 7-7 7" /></svg>
);
export const ArrowLeft = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><path d="M20 12H5M11 5l-7 7 7 7" /></svg>
);
export const Close = ({ className, size = 18 }: P) => (
  <svg {...base(size)} className={className}><path d="M5 5l14 14M19 5L5 19" /></svg>
);
export const Plus = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4v16M4 12h16" /></svg>
);
export const Sun = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>
);
export const Moon = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
);
export const Lock = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
export const Check = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><path d="M4 12l5 5L20 6" /></svg>
);
export const Grid = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>
);
export const Rows = ({ className, size = 16 }: P) => (
  <svg {...base(size)} className={className}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);
export const External = ({ className, size = 14 }: P) => (
  <svg {...base(size)} className={className}><path d="M7 17L17 7M9 7h8v8" /></svg>
);
