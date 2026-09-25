/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { Timeline } from './components/Timeline';
import { TaskCreationModal } from './components/TaskCreationModal';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Task, NotificationTone } from './types';
import { Plus, Trash2, Calendar, ArrowDown, AlertTriangle, X, Bell, Volume2, VolumeX, Clock } from 'lucide-react';
import { formatNotificationTime } from './lib/utils';
import { playNotificationSound, unlockAudio } from './lib/audio';

function safeRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

export default function App() {
  const [tasks, setTasks] = useLocalStorage<Task[]>('grid-planner-tasks', []);
  const [notifiedTasks, setNotifiedTasks] = useLocalStorage<Record<string, boolean>>('grid-planner-notified-tasks', {});
  const [snoozedAlerts, setSnoozedAlerts] = useLocalStorage<Record<string, number>>('grid-planner-snoozed-alerts', {});
  const [isSoundEnabled, setIsSoundEnabled] = useLocalStorage<boolean>('grid-sound-enabled', false); // Default to false (notification doesn't play sound)
  const [defaultTone, setDefaultTone] = useLocalStorage<NotificationTone>('grid-default-tone', 'chime');
  const [enabledOffsets, setEnabledOffsets] = useLocalStorage<string[]>('grid-planner-enabled-offsets', ['now', '5m', '10m']);
  
  const [activeAlerts, setActiveAlerts] = useState<Array<{ alertId: string; task: Task; type: string }>>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useLocalStorage<boolean>('grid-planner-sidebar-open', true);
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [prefillTime, setPrefillTime] = useState<{ start: string; end: string; title?: string } | null>(null);
  const [isCreationModalOpen, setIsCreationModalOpen] = useState(false);
  const [view, setView] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [theme, setTheme] = useLocalStorage<any>('grid-planner-theme', 'system');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Audio Unlocker for iOS/iPadOS
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      // Remove listeners after first interaction
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);

    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const handleToggleOffset = (offset: string) => {
    setEnabledOffsets(prev => {
      const current = prev || ['now', '5m', '10m'];
      if (current.includes(offset)) {
        if (current.length <= 1) return current; // Keep at least one active
        return current.filter(o => o !== offset);
      } else {
        return [...current, offset];
      }
    });
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && 'Notification' in window && window.Notification && window.Notification.permission !== 'granted' && window.Notification.permission !== 'denied') {
        window.Notification.requestPermission();
    }
  }, []);

  // Alert trigger function
  const triggerAlert = (task: Task, type: string) => {
    // 1. Audio chime — tasks using global ('default'/undefined) respect global toggle;
    //    tasks with an explicit per-task setting use their own soundEnabled flag.
    const usesGlobal = !task.reminderLeadTime || task.reminderLeadTime === 'default';
    const taskSoundOn = usesGlobal
      ? isSoundEnabled
      : (task.soundEnabled !== undefined ? task.soundEnabled : isSoundEnabled);
    if (taskSoundOn) {
      const toneToPlay = task.notificationTone || defaultTone;
      playNotificationSound(toneToPlay);
    }

    // 2. Native window push notification
    if (typeof window !== "undefined" && 'Notification' in window && window.Notification && window.Notification.permission === 'granted') {
      let bodyText = '';
      if (type === 'now') {
        bodyText = `Happening now: starts at ${formatNotificationTime(task.startTime)}`;
      } else if (type.endsWith('m')) {
        bodyText = `Starting in ${type.slice(0, -1)} minutes (${formatNotificationTime(task.startTime)})`;
      } else {
        bodyText = `Simulation: starts at ${formatNotificationTime(task.startTime)}`;
      }

      const title = task.title;
      const options = {
        body: bodyText,
        icon: '/apple-touch-icon.png'
      };

      if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, options);
        }).catch(() => {
          new window.Notification(title, options);
        });
      } else {
        new window.Notification(title, options);
      }
    }

    // 3. Add to visual alerts list overlay
    const alertId = `${task.id || 'task'}-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setActiveAlerts(prev => {
      if (prev.some(a => a.task.id === task.id && a.type === type)) return prev;
      return [...prev, { alertId, task, type }];
    });
  };

  const handleTriggerTestNotification = () => {
    unlockAudio(); // Explicitly unlock/resume on user action
    const now = new Date();
    const mockTask: Task = {
      id: 'mock-test-id-' + Date.now(),
      title: '💼 Project Review with Google Calendar Team',
      description: 'Discuss production notifications rollout, snooze logic and sound chime stability.',
      date: format(now, 'yyyy-MM-dd'),
      startTime: format(now, 'HH:mm'),
      endTime: format(addDays(now, 0), 'HH:mm'),
      isCompleted: false,
      color: 'blue'
    };
    triggerAlert(mockTask, 'test');
  };

  const handleDismissAlert = (alertId: string) => {
    setActiveAlerts(prev => prev.filter(a => a.alertId !== alertId));
  };

  const handleSnoozeAlert = (alertId: string, taskId: string) => {
    setActiveAlerts(prev => prev.filter(a => a.alertId !== alertId));
    
    // Snooze for 5 minutes (300 seconds)
    const snoozeTime = Date.now() + 5 * 60 * 1000;
    setSnoozedAlerts(prev => ({
      ...prev,
      [taskId]: snoozeTime
    }));
  };

  // Google Calendar Notification background check loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const nowMs = now.getTime();

      let newNotifications = false;
      const updatedNotifiedTasks = { ...notifiedTasks };
      const updatedSnoozedAlerts = { ...snoozedAlerts };

      // 1. Process Snoozed Alarms first
      Object.entries(updatedSnoozedAlerts).forEach(([taskId, snoozeTime]) => {
        if (nowMs >= (snoozeTime as number)) {
          const task = tasks.find(t => t.id === taskId);
          if (task && !task.isCompleted) {
            triggerAlert(task, 'now');
          }
          delete updatedSnoozedAlerts[taskId];
          newNotifications = true;
        }
      });

      // 2. Process standard task triggers — strict 3-way priority:
      //    'none'            → absolutely no alert, ignore global entirely
      //    specific value    → strict per-task override, ignore global entirely
      //    'default'/missing → use global enabledOffsets
      tasks.forEach(task => {
        if (task.date === todayStr && !task.isCompleted) {
          const leadTime = task.reminderLeadTime; // undefined or one of the union values

          // 'none' is a hard stop — zero alerts regardless of global settings
          if (leadTime === 'none') return;

          const [hours, mins] = task.startTime.split(':').map(Number);
          const taskStart = new Date(now);
          taskStart.setHours(hours, mins, 0, 0);
          const diffMins = (taskStart.getTime() - nowMs) / 60000;

          let alertType: string | null = null;
          const usesGlobal = !leadTime || leadTime === 'default';

          if (usesGlobal) {
            // Fall back to whatever the user has toggled on in the global bell panel
            if (enabledOffsets.includes('now') && diffMins >= -1 && diffMins <= 0.25) alertType = 'now';
            else if (enabledOffsets.includes('5m') && diffMins > 4.5 && diffMins <= 5.1) alertType = '5m';
            else if (enabledOffsets.includes('10m') && diffMins > 9.5 && diffMins <= 10.1) alertType = '10m';
            else if (enabledOffsets.includes('15m') && diffMins > 14.5 && diffMins <= 15.1) alertType = '15m';
            else if (enabledOffsets.includes('30m') && diffMins > 29.5 && diffMins <= 30.1) alertType = '30m';
          } else {
            // Strict per-task override — global lead-times are completely ignored
            if (leadTime === 'now' && diffMins >= -1 && diffMins <= 0.25) alertType = 'now';
            else if (leadTime === '5m' && diffMins > 4.5 && diffMins <= 5.1) alertType = '5m';
            else if (leadTime === '10m' && diffMins > 9.5 && diffMins <= 10.1) alertType = '10m';
            else if (leadTime === '15m' && diffMins > 14.5 && diffMins <= 15.1) alertType = '15m';
            else if (leadTime === '30m' && diffMins > 29.5 && diffMins <= 30.1) alertType = '30m';
          }

          if (alertType) {
            const notifiedKey = `${task.id}-${alertType}`;
            if (!updatedNotifiedTasks[notifiedKey] && !updatedSnoozedAlerts[task.id]) {
              updatedNotifiedTasks[notifiedKey] = true;
              newNotifications = true;
              triggerAlert(task, alertType);
            }
          }
        }
      });

      if (newNotifications) {
        setNotifiedTasks(updatedNotifiedTasks);
        setSnoozedAlerts(updatedSnoozedAlerts);
      }
    }, 5000); // Poll every 5 seconds for superior calendar trigger precision

    return () => clearInterval(interval);
  }, [tasks, notifiedTasks, snoozedAlerts, isSoundEnabled, enabledOffsets, setNotifiedTasks, setSnoozedAlerts]);

  // Ensure all tasks loaded from localStorage have valid, unique IDs
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    const seenIds = new Set<string>();
    let hasDuplicateOrMissing = false;
    const sanitized = tasks.map((t, i) => {
      let id = t.id;
      if (!id || seenIds.has(id)) {
        id = `task-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`;
        hasDuplicateOrMissing = true;
      }
      seenIds.add(id);
      return id !== t.id ? { ...t, id } : t;
    });
    if (hasDuplicateOrMissing) {
      setTasks(sanitized);
    }
  }, []);

  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  const handleAddTask = (newTaskData: Omit<Task, 'id' | 'isCompleted'> & { recurrence?: string }) => {
    const { recurrence, ...taskData } = newTaskData;
    const baseDate = new Date(taskData.date + "T00:00:00");
    const newTasks: Task[] = [];

    if (recurrence && recurrence !== 'none') {
      const groupId = safeRandomId();
      let limit = 0;
      if (recurrence === 'daily') limit = 365;
      else if (recurrence === 'weekly') limit = 52;
      else if (recurrence === 'monthly') limit = 12;

      for (let i = 0; i < limit; i++) {
        let nextDate = baseDate;
        if (recurrence === 'daily') nextDate = addDays(baseDate, i);
        else if (recurrence === 'weekly') nextDate = addWeeks(baseDate, i);
        else if (recurrence === 'monthly') nextDate = addMonths(baseDate, i);

        newTasks.push({
          ...taskData,
          date: format(nextDate, 'yyyy-MM-dd'),
          id: safeRandomId(),
          isCompleted: false,
          originalRecurrence: recurrence,
          recurrenceGroupId: groupId,
        });
      }
    } else {
      newTasks.push({
        ...taskData,
        id: safeRandomId(),
        isCompleted: false,
        originalRecurrence: 'none',
      });
    }
    setTasks((prev) => [...prev, ...newTasks]);
  };

  const handleToggleStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, isCompleted: !task.isCompleted } : task
      )
    );
  };

  const handleDeleteTask = (id: string, option?: 'only-this' | 'all' | 'future', force = false) => {
    const targetTask = tasks.find((t) => t.id === id);
    if (!targetTask) return;

    const isRecurring = targetTask.originalRecurrence && targetTask.originalRecurrence !== 'none';

    if (force || !isRecurring || option) {
      const activeOption = option || 'only-this';
      if (activeOption === 'only-this') {
        setTasks((prev) => prev.filter((task) => task.id !== id));
      } else {
        const belongsToGroup = (task: Task) => {
          if (targetTask.recurrenceGroupId && task.recurrenceGroupId) {
            return task.recurrenceGroupId === targetTask.recurrenceGroupId;
          }
          return (
            !!targetTask.originalRecurrence &&
            targetTask.originalRecurrence !== 'none' &&
            task.originalRecurrence === targetTask.originalRecurrence &&
            task.title.trim().toLowerCase() === targetTask.title.trim().toLowerCase()
          );
        };

        if (activeOption === 'all') {
          setTasks((prev) => prev.filter((task) => !belongsToGroup(task)));
        } else if (activeOption === 'future') {
          setTasks((prev) =>
            prev.filter((task) => {
              if (!belongsToGroup(task)) return true;
              return task.date < targetTask.date;
            })
          );
        }
      }
      setDeletingTask(null);
    } else {
      setDeletingTask(targetTask);
    }
  };

  const handleUpdateTask = (updatedTask: Task) => {
    console.log("UPDATING", updatedTask.id, "Existing:", tasks.find(t => t.id === updatedTask.id));
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const themeThemes: Record<string, string> = {
    white: "bg-white text-stone-900 border-gray-200",
    gray: "bg-gray-100 text-stone-900 border-gray-300",
    black: "bg-black text-white border-gray-800",
    teal: "bg-[#f2faf9] text-teal-950 border-[#5cb8b2]/30",
    cyan: "bg-[#f3fcfd] text-[#103b45] border-[#6ed5ee]/30",
    peach: "bg-[#fffbf2] text-[#4d3d1a] border-[#fcd891]/30",
    coral: "bg-[#fff5f5] text-[#5c1d1d] border-[#ff4040]/30",
    rose: "bg-[#fbf4f7] text-[#492b38] border-[#d8a9bb]/40",
    sage: "bg-[#f4f8f1] text-[#334333] border-[#a9c1a2]/40"
  };

  const effectiveTheme = theme === 'system' ? (isDarkMode ? 'black' : 'white') : theme;

  const currentThemeStr = themeThemes[effectiveTheme] || themeThemes.white;
  const isDarkClass = effectiveTheme === 'black' ? 'dark' : '';

  useEffect(() => {
    if (effectiveTheme === 'black') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveTheme]);

  return (
    <div className={`flex flex-row h-full w-full overflow-hidden font-sans ${currentThemeStr} theme-${effectiveTheme} ${isDarkClass}`}>
      <Timeline 
        tasks={tasks} 
        onToggleStatus={handleToggleStatus} 
        onDeleteTask={handleDeleteTask}
        onUpdateTask={handleUpdateTask}
        onAddTask={handleAddTask}
        selectedDate={selectedDate} 
        onGridClick={(hour, minute, dateStr, customEndTimeStr, prefillTitle) => {
          if (dateStr) setSelectedDate(dateStr);
          const startStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          
          let endStr = customEndTimeStr;
          if (!endStr) {
            let endHour = hour;
            let endMin = minute + 60; // default duration is 1 hour
            if (endMin >= 60) {
              endHour += Math.floor(endMin / 60);
              endMin = endMin % 60;
            }
            if (endHour >= 24) {
              endHour = 23;
              endMin = 59;
            }
            endStr = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
          }
          setPrefillTime({ start: startStr, end: endStr, title: prefillTitle });
          setIsCreationModalOpen(true);
        }}
        view={view}
        onViewChange={setView}
        setSelectedDate={setSelectedDate}
        theme={theme}
        setTheme={setTheme}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onAddTaskClick={() => {
          setPrefillTime(null);
          setIsCreationModalOpen(true);
        }}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={() => setIsSoundEnabled(!isSoundEnabled)}
        onTriggerTestNotification={handleTriggerTestNotification}
        enabledOffsets={enabledOffsets}
        onToggleOffset={handleToggleOffset}
        defaultTone={defaultTone}
        onToneChange={setDefaultTone}
      />
      
      <TaskCreationModal 
        isOpen={isCreationModalOpen}
        onClose={() => {
          setIsCreationModalOpen(false);
          setPrefillTime(null);
        }}
        onAddTask={handleAddTask}
        initialDate={selectedDate}
        prefillTime={prefillTime}
      />

      {/* Recurrence Delete Option Modal */}
      {deletingTask && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center z-50 transition-all">
          <div className="bg-white dark:bg-stone-900 rounded-2xl border border-gray-200 dark:border-white/10 w-full max-w-sm p-6 shadow-2xl relative select-none mx-4 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setDeletingTask(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-955 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-stone-800 p-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
            
            <div className="flex items-start gap-3 mb-5">
              <div className="h-9 w-9 rounded-full bg-rose-50 dark:bg-rose-955/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
                  Delete repeating event?
                </h3>
                <p className="text-xs font-semibold text-violet-605 dark:text-violet-400 mt-1 truncate">
                  "{deletingTask.title}"
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                  This task propagates on a {deletingTask.originalRecurrence} repeating scale. Select the scope of deletion:
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {/* Option 1: Just this instance */}
              <button
                onClick={() => handleDeleteTask(deletingTask.id, 'only-this', true)}
                className="w-full text-left p-2.5 border border-stone-200 dark:border-stone-800 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-violet-300 dark:hover:border-violet-500/20 transition-all flex items-start gap-2.5 group cursor-pointer"
              >
                <div className="h-5 w-5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 group-hover:text-violet-600 transition-colors">
                  <Calendar className="w-3 h-3" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 leading-snug">
                    This event only
                  </h4>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Only delete local instance on {deletingTask.date}.
                  </p>
                </div>
              </button>

              {/* Option 2: This and future instances */}
              <button
                onClick={() => handleDeleteTask(deletingTask.id, 'future', true)}
                className="w-full text-left p-2.5 border border-stone-200 dark:border-stone-800 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-violet-300 dark:hover:border-violet-500/20 transition-all flex items-start gap-2.5 group cursor-pointer"
              >
                <div className="h-5 w-5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 group-hover:text-violet-600 transition-colors">
                  <ArrowDown className="w-3 h-3" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 leading-snug">
                    This and all future events
                  </h4>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Cancel current event and subsequent recurrences.
                  </p>
                </div>
              </button>

              {/* Option 3: All instances */}
              <button
                onClick={() => handleDeleteTask(deletingTask.id, 'all', true)}
                className="w-full text-left p-2.5 border border-stone-200 dark:border-stone-800 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-rose-300 dark:hover:border-rose-500/20 transition-all flex items-start gap-2.5 group cursor-pointer"
              >
                <div className="h-5 w-5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-rose-50 dark:group-hover:bg-rose-900/30 group-hover:text-rose-600 transition-colors">
                  <Trash2 className="w-3 h-3" strokeWidth={1.75} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 leading-snug">
                    All events in series
                  </h4>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Remove entire series ({deletingTask.originalRecurrence} interval).
                  </p>
                </div>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-stone-800 flex justify-end gap-2.5">
              <button
                onClick={() => setDeletingTask(null)}
                className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 border border-gray-205 hover:bg-gray-100 rounded-lg dark:border-stone-800 dark:text-gray-300 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating In-App Active Alarms Tray (Google Calendar Style) */}
      {activeAlerts.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:bottom-6 md:right-6 md:left-auto md:w-96 z-[100] flex flex-col gap-3.5 mx-auto max-w-[calc(100%-2rem)] md:max-w-sm w-full p-0 md:p-4 pointer-events-none select-none">
          {activeAlerts.map(({ alertId, task, type }, idx) => {
            const colorBorders = {
              blue: 'bg-blue-50/95 dark:bg-stone-900/95 text-blue-900 dark:text-blue-100',
              green: 'bg-green-50/95 dark:bg-stone-900/95 text-green-900 dark:text-green-100',
              yellow: 'bg-amber-50/95 dark:bg-stone-900/95 text-amber-900 dark:text-amber-100',
              red: 'bg-red-50/95 dark:bg-stone-900/95 text-red-900 dark:text-red-100',
            };
            
            const alertText = type === 'now' 
              ? 'Starts Commencing Now' 
              : type === '5m' 
                ? 'Starts in 5 minutes' 
                : type === '10m' 
                  ? 'Starts in 10 minutes' 
                  : 'Alarm Simulation';

            return (
              <div 
                key={alertId ? `${alertId}-${idx}` : `alert-${idx}`} 
                className={`pointer-events-auto rounded-2xl shadow-2xl ${colorBorders[task.color || 'blue']} border border-gray-200/80 dark:border-white/10 p-5 flex flex-col gap-3.5 animate-in slide-in-from-bottom-8 md:slide-in-from-right-12 duration-300 relative max-h-[80vh] overflow-hidden`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="uppercase tracking-widest text-[10px]">{alertText}</span>
                  </div>
                  <button 
                    onClick={() => handleDismissAlert(alertId)}
                    className="p-1 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-1 overflow-y-auto pr-1 custom-scrollbar">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                    {task.title}
                  </h3>
                  <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <span>Today, {formatNotificationTime(task.startTime)} – {formatNotificationTime(task.endTime)}</span>
                  </div>
                  {task.description && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 italic line-clamp-3 md:line-clamp-none mt-1 leading-snug">
                      "{task.description}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200/50 dark:border-stone-850 shrink-0">
                  <button
                    onClick={() => handleSnoozeAlert(alertId, task.id)}
                    className="px-3 py-1.5 border border-gray-300 dark:border-stone-700 hover:border-gray-400 dark:hover:border-stone-600 rounded-xl text-[11px] font-bold text-gray-700 dark:text-gray-300 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Snooze (5m)
                  </button>
                  <button
                    onClick={() => handleDismissAlert(alertId)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-xl text-[11px] font-bold transition-all cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
