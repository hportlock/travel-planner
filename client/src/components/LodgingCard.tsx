import type { LodgingRow } from '@travel-plan/shared';

interface LodgingCardProps {
  lodging: LodgingRow;
}

export default function LodgingCard({ lodging }: LodgingCardProps): JSX.Element {
  return (
    <div className="tp-lodging rounded-card border-2 border-[#e7d6ba] bg-white px-4 py-4 shadow-[0_8px_0_#efe1c8]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[16px] font-extrabold text-ink">
            {lodging.is_home_base ? '🏡 ' : '🛏️ '}
            {lodging.name}
          </div>
          {lodging.address ? (
            <div className="mt-0.5 text-[13px] font-semibold text-[#6a553c]">{lodging.address}</div>
          ) : null}
        </div>
        {lodging.is_home_base ? (
          <span className="flex-none rounded-full bg-[#ffe7c4] px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-[#a05f00]">
            Home base
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11.5px] font-semibold text-[#8a6f4c]">
        {lodging.check_in ? <span>Check-in {lodging.check_in}</span> : null}
        {lodging.check_out ? <span>Check-out {lodging.check_out}</span> : null}
        {lodging.cost ? <span>{lodging.cost}</span> : null}
      </div>

      {lodging.notes ? (
        <div className="mt-2 text-[13px] font-semibold text-[#6a553c]">{lodging.notes}</div>
      ) : null}

      {lodging.gmap_url ? (
        <a
          href={lodging.gmap_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ocean px-3 py-1.5 text-[12.5px] font-extrabold text-white"
        >
          📍 Map
        </a>
      ) : null}
    </div>
  );
}
