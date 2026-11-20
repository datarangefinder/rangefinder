import { YEAR_MIN, YEAR_MAX, yearToLabel } from './TimeScale.js';

export const DAYS_PER_YEAR = 365.2425;
export const MIN_TIMELINE_SPAN = 2 / DAYS_PER_YEAR;
export const MAX_TIMELINE_SPAN = YEAR_MAX - YEAR_MIN;
export const DEFAULT_TIMELINE_SPAN = MAX_TIMELINE_SPAN * 260 / 1200;
const DAY_MS = 86_400_000;
const MAX_TIMELINE_TICKS = 100;
const DAY_STEPS = [1 / 24, 2 / 24, 3 / 24, 6 / 24, 12 / 24, 1, 2, 7, 14, 30, 90, 180];

export function clampTimelineSpan(span) {
  if (Number.isNaN(span)) return DEFAULT_TIMELINE_SPAN;
  return Math.max(MIN_TIMELINE_SPAN, Math.min(MAX_TIMELINE_SPAN, span));
}

function yearStartTime(year) {
  const date = new Date(0);
  date.setUTCFullYear(year, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function calendarTime(year) {
  const wholeYear = Math.floor(year);
  const start = yearStartTime(wholeYear);
  return start + (year - wholeYear) * (yearStartTime(wholeYear + 1) - start);
}

function calendarYear(time) {
  const year = new Date(time).getUTCFullYear();
  const start = yearStartTime(year);
  return year + (time - start) / (yearStartTime(year + 1) - start);
}

/** Fine views use calendar time, avoiding both Z-coordinate cancellation and leap-year drift. */
export function getTimelineWindow(centerYear, requestedSpan) {
  const spanYears = clampTimelineSpan(requestedSpan);
  const center = Math.max(YEAR_MIN + spanYears / 2, Math.min(YEAR_MAX - spanYears / 2, centerYear));
  if (spanYears <= 1 && Math.abs(center) < 200_000) {
    const duration = spanYears * DAYS_PER_YEAR * DAY_MS;
    const endTime = Math.min(yearStartTime(YEAR_MAX), calendarTime(center) + duration / 2);
    const startTime = endTime - duration;
    return {
      centerYear: calendarYear((startTime + endTime) / 2), spanYears,
      minYear: calendarYear(startTime), maxYear: calendarYear(endTime), startTime, endTime,
    };
  }
  return { centerYear: center, spanYears, minYear: center - spanYears / 2, maxYear: center + spanYears / 2 };
}

export function timelineYearPosition(year, window) {
  if (window.startTime !== undefined && Math.abs(year) < 200_000) {
    return (calendarTime(year) - window.startTime) / (window.endTime - window.startTime);
  }
  return (year - window.minYear) / (window.maxYear - window.minYear);
}

export function timelineYearAtPosition(position, window) {
  if (window.startTime !== undefined) {
    return calendarYear(window.startTime + position * (window.endTime - window.startTime));
  }
  return window.minYear + position * (window.maxYear - window.minYear);
}

function dateLabel(time, includeYear = false, includeTime = true) {
  const date = new Date(Math.round(time / 60_000) * 60_000);
  const year = date.getUTCFullYear();
  const prefix = includeYear ? `${year > 0 ? year : `紀元前${1 - year}`}/` : '';
  const day = `${prefix}${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  const clock = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  return includeTime ? `${day} ${clock}` : day;
}

export function formatTimelineFocus(year, spanYears) {
  if (spanYears <= 1 && Math.abs(year) < 200_000) return dateLabel(calendarTime(year), true);
  if (spanYears < 10_000 && Math.abs(year) < 1_000_000) {
    const wholeYear = Math.floor(year);
    return wholeYear > 0 ? `西暦${wholeYear}年` : `紀元前${Math.abs(wholeYear)}年`;
  }
  return yearToLabel(Math.floor(year));
}

export function formatTimelineSpan(spanYears) {
  if (spanYears <= MIN_TIMELINE_SPAN * 1.001) return '2日（48時間）';
  if (spanYears < 1 / 12) return `${Number((spanYears * DAYS_PER_YEAR).toPrecision(3))}日`;
  if (spanYears < 1) return `${Number((spanYears * 12).toPrecision(3))}か月`;
  if (spanYears === MAX_TIMELINE_SPAN) return '全期間';
  if (spanYears >= 100_000_000) return `${Number((spanYears / 100_000_000).toPrecision(3))}億年`;
  if (spanYears >= 10_000) return `${Number((spanYears / 10_000).toPrecision(3))}万年`;
  return `${Number(spanYears.toPrecision(3))}年`;
}

/** Readable, bounded tick counts from cosmic history down to a two-day screen. */
export function getTimelineTicks(window, width) {
  // Choose a coarser interval before generation when the monitor is very wide.
  // Capping only the loop would leave the middle/right of the archive without dates.
  const targetCount = Math.min(MAX_TIMELINE_TICKS - 1, Math.max(2, Math.floor(width / 140)));
  const ticks = [];
  if (window.startTime !== undefined) {
    const desiredDays = (window.endTime - window.startTime) / DAY_MS / targetCount;
    const step = (DAY_STEPS.find(value => value >= desiredDays) ?? 365) * DAY_MS;
    const first = Math.ceil(window.startTime / step);
    const last = Math.floor(window.endTime / step);
    for (let i = first; i <= last && ticks.length < MAX_TIMELINE_TICKS; i++) {
      const time = i * step;
      ticks.push({
        year: calendarYear(time), major: true,
        label: dateLabel(time, false, window.spanYears * DAYS_PER_YEAR <= 7),
        position: (time - window.startTime) / (window.endTime - window.startTime),
      });
    }
    return ticks;
  }
  if (window.spanYears <= 1) {
    const referenceYear = Math.floor(window.minYear);
    const startDay = (window.minYear - referenceYear) * DAYS_PER_YEAR;
    const endDay = (window.maxYear - referenceYear) * DAYS_PER_YEAR;
    const step = DAY_STEPS.find(value => value >= (endDay - startDay) / targetCount) ?? 365;
    for (let i = Math.ceil(startDay / step); i <= Math.floor(endDay / step) && ticks.length < MAX_TIMELINE_TICKS; i++) {
      const day = i * step;
      const minuteOfDay = Math.round((day - Math.floor(day)) * 1440);
      const clock = `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
      ticks.push({
        year: referenceYear + day / DAYS_PER_YEAR, major: true,
        label: `${Math.floor(day) + 1}日目 ${clock}`,
        position: (day - startDay) / (endDay - startDay),
      });
    }
    return ticks;
  }
  const span = window.maxYear - window.minYear;
  const desired = span / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(desired));
  const unit = [1, 2, 5, 10].find(value => value * magnitude >= desired) * magnitude;
  const first = Math.ceil(window.minYear / unit);
  const last = Math.floor(window.maxYear / unit);
  for (let i = first; i <= last && ticks.length < MAX_TIMELINE_TICKS; i++) {
    const year = i * unit;
    // Fine views of deep time need exact years, not identical rounded billion-year labels.
    const label = year < -1_000_000 && unit < 100_000_000
      ? `${Math.abs(year).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}年前`
      : formatTimelineFocus(year, span);
    ticks.push({ year, label, major: true, position: timelineYearPosition(year, window) });
  }
  return ticks;
}
