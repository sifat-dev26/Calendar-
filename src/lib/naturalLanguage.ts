import * as chrono from "chrono-node";

export interface ParsedNaturalTask {
  taskName: string;
  hasDate: boolean;
  hasTime: boolean;
  date?: string;
  startTime?: string;
  endTime?: string;
}

const pad = (value: number) => value.toString().padStart(2, "0");

const formatDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export function parseNaturalLanguageTask(text: string, defaultDate: string): ParsedNaturalTask | null {
  const referenceDate = new Date(`${defaultDate}T12:00:00`);
  if (Number.isNaN(referenceDate.getTime())) return null;

  const results = chrono.parse(text, referenceDate, { forwardDate: true });
  if (results.length === 0) return null;

  const hasKnownValue = (result: (typeof results)[number], keys: string[]) =>
    keys.some((key) => result.start.isCertain(key as never));
  const dateResult = results.find((result) => hasKnownValue(result, ["day", "weekday", "month", "year"]));
  const timeResult = results.find((result) => hasKnownValue(result, ["hour"]));
  const hasDate = Boolean(dateResult);
  const hasTime = Boolean(timeResult);
  if (!hasDate && !hasTime) return null;

  const ranges = results
    .map((result) => ({ start: result.index, end: result.index + result.text.length }))
    .sort((left, right) => left.start - right.start);
  let cursor = 0;
  let taskName = "";
  for (const range of ranges) {
    if (range.start < cursor) continue;
    taskName += text.slice(cursor, range.start);
    cursor = range.end;
  }
  taskName += text.slice(cursor);
  taskName = taskName
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .replace(/\s+(?:at|on|for|by|around|this|next)$/i, "")
    .trim();

  const start = timeResult?.start.date();
  const end = timeResult?.end?.date();
  let endTime: string | undefined;
  if (start) {
    const endDate = end && end.getTime() > start.getTime()
      ? end
      : new Date(start.getTime() + 60 * 60 * 1000);
    endTime = formatTime(endDate);
  }

  return {
    taskName: taskName || text.trim(),
    hasDate,
    hasTime,
    ...(hasDate && dateResult ? { date: formatDate(dateResult.start.date()) } : {}),
    ...(hasTime && start ? { startTime: formatTime(start), endTime } : {}),
  };
}