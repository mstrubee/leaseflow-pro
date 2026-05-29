import { useEffect, useState } from "react";

interface Props {
  value: number;
  onChange: (minutes: number) => void;
  className?: string;
  min?: number;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Input numérico de minutos que permite borrar por completo el valor mientras
 * se edita (estado local string). Normaliza al perder el foco: vacío o < min → min.
 */
export function MinutesInput({ value, onChange, className = "", min = 5, onClick }: Props) {
  const [local, setLocal] = useState(String(value));

  // Sincroniza si el valor externo cambia (p. ej. al reordenar paradas)
  useEffect(() => { setLocal(String(value)); }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={480}
      step={5}
      value={local}
      onClick={onClick}
      onChange={(e) => {
        setLocal(e.target.value);            // permite "" mientras escribe
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = parseInt(local, 10);
        const normalized = isNaN(n) || n < min ? min : n;
        onChange(normalized);
        setLocal(String(normalized));
      }}
      className={className}
    />
  );
}
