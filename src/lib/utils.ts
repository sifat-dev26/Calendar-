import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility for merging Tailwind CSS classes with clsx.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Global constants for the calendar grid layout.
 */
export const START_HOUR = 0;
export const END_HOUR = 24;
export const ROW_HEIGHT_PX = 64; // Adjusted to common value used in this template

/**
 * Formats a 24-hour hour number into a 12-hour string (e.g., "1 PM").
 */
export function format12Hour(time: number | string): string {
  let h: number;
  let m: number = 0;

  if (typeof time === 'string') {
    const parts = time.split(':').map(Number);
    h = parts[0];
    m = parts[1] || 0;
  } else {
    h = time;
  }

  if (h === 12 && m === 0) return "Noon";
  if ((h === 0 || h === 24) && m === 0) return "12 AM";
  
  const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mStr = m > 0 ? `:${m.toString().padStart(2, '0')}` : '';
  return `${h12}${mStr} ${ampm}`;
}

/**
 * Formats a TaskReminderLeadTime value into a human-readable string.
 */
export function formatNotificationTime(leadTime: string): string {
  if (!leadTime || leadTime === 'none') return "None";
  if (leadTime === 'at_time' || leadTime === 'now') return "At time of event";
  if (leadTime === '5m') return "5 minutes before";
  if (leadTime === '10m') return "10 minutes before";
  if (leadTime === '15m') return "15 minutes before";
  if (leadTime === '30m' || leadTime === 'default') return "30 minutes before";
  if (leadTime === '1h') return "1 hour before";
  if (leadTime === '1d') return "1 day before";
  
  // Fallback for HH:mm if it ever happens
  if (leadTime.includes(':')) {
    const [h, m] = leadTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return leadTime;
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
  }
  
  return leadTime;
}
