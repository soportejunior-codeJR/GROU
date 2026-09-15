'use client';

// Trazos de fondo del Panel de Datos ROFÉ (BRAND-DIGITAL.md §4.2): la misma fórmula de
// 30 curvas en dos capas espejadas. Sin framer-motion: la animación vive en CSS
// (.background-path) y prefers-reduced-motion la apaga, dejando los trazos estáticos.

function trazos(posicion: number) {
  return Array.from({ length: 30 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 6 * posicion} -${189 + i * 7}C-${380 - i * 6 * posicion} -${
      189 + i * 7
    } -${312 - i * 6 * posicion} ${216 - i * 7} ${152 - i * 6 * posicion} ${343 - i * 7}C${
      616 - i * 6 * posicion
    } ${470 - i * 7} ${684 - i * 6 * posicion} ${875 - i * 7} ${684 - i * 6 * posicion} ${
      875 - i * 7
    }`,
    width: 0.6 + i * 0.04,
    opacity: 0.04 + i * 0.012,
  }));
}

function Capa({ posicion, className }: { posicion: number; className: string }) {
  return (
    <svg
      className={`background-paths-capa ${className}`}
      viewBox="0 0 696 316"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      {trazos(posicion).map((p) => (
        <path
          key={p.id}
          className="background-path"
          d={p.d}
          pathLength={1}
          stroke="currentColor"
          strokeWidth={p.width}
          strokeOpacity={p.opacity}
          style={{ animationDuration: `${22 + p.id * 0.55}s` }}
        />
      ))}
    </svg>
  );
}

export default function BackgroundPaths() {
  return (
    <div className="background-paths" aria-hidden="true">
      <Capa posicion={1} className="background-paths-capa-a" />
      <Capa posicion={-1} className="background-paths-capa-b" />
    </div>
  );
}
