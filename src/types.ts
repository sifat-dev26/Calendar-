export type ThemeMode = 'system' | 'white' | 'gray' | 'black' | 'teal' | 'cyan' | 'peach' | 'coral' | 'rose' | 'sage';
export type TaskReminderLeadTime = 'default' | 'none' | 'at_time' | 'now' | '5m' | '10m' | '15m' | '30m' | '1h' | '1d';
export type NotificationTone = 
  | 'chime' 
  | 'beep' 
  | 'zen' 
  | 'arcade' 
  | 'pulse' 
  | 'ping' 
  | 'double' 
  | 'chirp' 
  | 'click' 
  | 'siren';

export interface Task {
  id: string;
  title: string;
  date: string; // Format: YYYY-MM-DD
  startTime: string; // Format: HH:mm (24-hour)
  endTime: string; // Format: HH:mm (24-hour)
  isCompleted: boolean;
  color?: 'blue' | 'green' | 'yellow' | 'red';
  isAllDay?: boolean;
  description?: string;
  originalRecurrence?: string;
  recurrenceGroupId?: string;
  subTasks?: { id: string; text: string; done: boolean }[];
  focusTip?: string;
  reminderLeadTime?: TaskReminderLeadTime;
  soundEnabled?: boolean;
  notificationTone?: NotificationTone;
}
