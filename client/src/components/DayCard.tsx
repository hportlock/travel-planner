import type {
  DayWithItems,
  EventWithReviews,
  LayoutConfig,
  RegionsMap,
} from '@travel-plan/shared';
import ActivityRow from './ActivityRow';

interface DayCardProps {
  day: DayWithItems;
  eventsById: Map<string, EventWithReviews>;
  regions: RegionsMap;
  dayStyle: LayoutConfig['dayStyle'];
  showRegionColors: boolean;
  onOpen: (event: EventWithReviews) => void;
}

export default function DayCard({
  day,
  eventsById,
  regions,
  dayStyle,
  showRegionColors,
  onOpen,
}: DayCardProps): JSX.Element {
  const rows = day.items
    .map((item) => {
      const event = eventsById.get(item.event_id);
      return event ? { item, event } : null;
    })
    .filter((r): r is { item: typeof day.items[number]; event: EventWithReviews } => r !== null);

  const itemsClass =
    dayStyle === 'grid'
      ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
      : dayStyle === 'timeline'
        ? 'relative flex flex-col gap-3 border-l-2 border-dashed border-[#e7d6ba] pl-5'
        : 'flex flex-col gap-3';

  return (
    <article className="tp-day mb-[18px] overflow-hidden rounded-card border-2 border-[#e7d6ba] bg-white shadow-[0_10px_24px_rgba(150,100,50,0.12)]">
      <div className="tp-day-head flex items-center gap-3 bg-[#f8825f] px-4 py-3.5 text-white">
        <div className="flex h-12 w-12 flex-none -rotate-[4deg] flex-col items-center justify-center rounded-[11px] bg-white/90 text-[#b3445f] shadow-[0_4px_10px_rgba(120,40,70,0.25)]">
          <span className="font-display text-[15px] font-extrabold leading-none">
            {(day.dow || '').slice(0, 3) || '•'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[19px] font-extrabold leading-tight">{day.dow || 'Day'}</div>
          {day.date_label ? (
            <div className="mt-0.5 font-mono text-[11.5px] font-bold text-white/90">{day.date_label}</div>
          ) : null}
        </div>
        {day.flag ? (
          <span
            className="tp-day-flag ml-auto self-start whitespace-nowrap rounded-md border-[1.5px] border-white/60 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide text-white"
            style={{ background: day.flag_color || 'rgba(0,0,0,0.18)' }}
          >
            {day.flag}
          </span>
        ) : null}
      </div>

      {day.drive ? (
        <div className="px-4 pb-1 pt-3 font-mono text-[11.5px] font-semibold tracking-wide text-[#8a6f4c]">
          🚗 {day.drive}
        </div>
      ) : null}

      <div className="border-t-2 border-dashed border-[#e7d6ba] px-4 py-4">
        {rows.length === 0 ? (
          <p className="rounded-xl border-2 border-dashed border-[#e7d6ba] px-5 py-6 text-center font-semibold text-[#8a6f4c]">
            No activities planned yet.
          </p>
        ) : (
          <div className={itemsClass}>
            {rows.map(({ item, event }) => (
              <ActivityRow
                key={item.id}
                item={item}
                event={event}
                regions={regions}
                showRegionColors={showRegionColors}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}

        {day.note ? (
          <div className="mt-3 rounded-[10px] border-[1.5px] border-dashed border-[#f0c9a8] bg-[#fff7ef] px-3.5 py-2.5 text-[13px] font-bold text-[#8a5a3a]">
            {day.note}
          </div>
        ) : null}
      </div>
    </article>
  );
}
