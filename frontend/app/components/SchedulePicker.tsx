// components/SchedulePicker.tsx
import { ScheduleDay, formatDateLabel, toLocalISO } from '@/lib/utils/schedule';

type Props = {
  slots: ScheduleDay[];
  onPickSlot: (isoLocal: string, raw: { date: string; time: string }) => void;
  isDisabled: boolean;
  className?: string;
};

export default function SchedulePicker({ slots, onPickSlot, isDisabled, className }: Props) {
  return (
    <div className={className}>
      <div className="space-y-3">
        Please select a time below:
        {slots.map(({ date, times }) => (
          <div
            key={date}
            className="rounded-xl border border-[#E8E2D9] bg-white p-3"
          >
            <div className="text-sm font-medium text-gray-700 mb-2">
              {formatDateLabel(date)}
            </div>
            <div className="flex flex-wrap gap-2">
              {times.map((t) => (
                <button
                  key={t}
                  disabled={isDisabled}
                  type="button"
                  onClick={() => onPickSlot(toLocalISO(date, t), { date, time: t })}
                  className="px-3 py-1.5 rounded-full border border-[#E8E2D9] bg-[#FDFBF7] hover:bg-[#F6F1E9] text-gray-900 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
