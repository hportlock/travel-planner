import type { CSSProperties } from 'react';
import type { DayItemRow, EventWithReviews, RegionsMap } from '@travel-plan/shared';
import { formatTime12 } from '@travel-plan/shared';

interface ActivityRowProps {
  item: DayItemRow;
  event: EventWithReviews;
  regions: RegionsMap;
  showRegionColors: boolean;
  onOpen: (event: EventWithReviews) => void;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Time label: formatted clock range, else capitalized time-of-day bucket. */
export function timeLabel(item: Pick<DayItemRow, 'start_time' | 'end_time' | 'time_of_day'>): string {
  if (item.start_time) {
    const start = formatTime12(item.start_time);
    const end = item.end_time ? formatTime12(item.end_time) : '';
    return end ? `${start}–${end}` : start;
  }
  if (item.time_of_day) return capitalize(item.time_of_day);
  return '';
}

export default function ActivityRow({
  item,
  event,
  regions,
  showRegionColors,
  onOpen,
}: ActivityRowProps): JSX.Element {
  const region = regions[event.region];
  const regionColor = region?.color ?? 'var(--ocean)';
  const firstTag = event.tags[0];
  const time = timeLabel(item);

  return (
    <button
      type="button"
      className="tp-activity flex w-full cursor-pointer items-stretch gap-3 rounded-xl border-[1.5px] border-[#eaddc4] bg-[#fffdf8] p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(150,100,50,0.16)]"
      data-region={event.region || undefined}
      data-time-of-day={item.time_of_day ?? undefined}
      data-tag={firstTag ?? undefined}
      onClick={() => onOpen(event)}
      style={showRegionColors ? ({ '--region-color': regionColor } as CSSProperties) : undefined}
    >
      <span
        className="tp-activity-emoji flex h-[46px] w-[46px] flex-none -rotate-3 items-center justify-center rounded-[10px] text-[24px]"
        style={{ background: 'color-mix(in oklab, var(--region-color, var(--ocean)) 16%, #fff)' }}
        aria-hidden
      >
        {event.emoji || '📍'}
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="tp-activity-name font-display text-[16px] font-extrabold leading-tight text-ink">
            {event.name}
          </span>
          {time ? (
            <span className="tp-activity-time rounded-[5px] bg-[#f3e8d2] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#9a7f5c]">
              {time}
            </span>
          ) : null}
        </span>

        {showRegionColors && region ? (
          <span
            className="tp-region-pill inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold text-white"
            data-region={event.region || undefined}
            style={{ background: 'var(--region-color)' }}
          >
            {region.label}
          </span>
        ) : null}

        {item.note ? <span className="text-[13px] font-semibold text-[#6a553c]">{item.note}</span> : null}
      </span>

      <span className="flex flex-none items-center self-center text-[16px] font-black text-[#c9a877]" aria-hidden>
        ›
      </span>
    </button>
  );
}
