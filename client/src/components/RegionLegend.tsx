import type { RegionsMap } from '@travel-plan/shared';

interface RegionLegendProps {
  regions: RegionsMap;
}

export default function RegionLegend({ regions }: RegionLegendProps): JSX.Element | null {
  const entries = Object.entries(regions);
  if (entries.length === 0) return null;

  return (
    <div className="mx-auto mb-5 flex max-w-[760px] flex-wrap gap-2">
      {entries.map(([key, def]) => (
        <span
          key={key}
          className="tp-region-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold text-white"
          data-region={key}
          style={{ background: def.color }}
        >
          {def.label}
        </span>
      ))}
    </div>
  );
}
