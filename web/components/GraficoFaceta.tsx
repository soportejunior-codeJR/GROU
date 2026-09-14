import type { Dataset, Filtros, Modo } from '@/lib/dataset';

/** Punto de extensión de T10.2; T10.0 lo separa sin alterar el panel existente. */
export default function GraficoFaceta(_props: {
  ds: Dataset;
  campo: string;
  filtros: Filtros;
  modo: Modo;
}) {
  return null;
}
