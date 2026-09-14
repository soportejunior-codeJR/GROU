'use client';

const PATHS = [
  'M-80 180 C 180 20, 360 340, 650 150 S 1080 20, 1360 210',
  'M-120 520 C 200 300, 390 680, 720 470 S 1120 270, 1400 500',
  'M-100 820 C 220 600, 430 980, 760 760 S 1160 560, 1420 800',
];

export default function BackgroundPaths() {
  return (
    <svg
      className="background-paths"
      viewBox="0 0 1280 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {PATHS.map((path, index) => (
        <path className="background-path" d={path} key={index} />
      ))}
    </svg>
  );
}
