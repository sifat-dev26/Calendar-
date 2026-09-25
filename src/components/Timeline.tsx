import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addWeeks, addMonths, eachMonthOfInterval, startOfYear, endOfYear } from "date-fns";
import { Check, Search, X, Calendar as CalendarIcon, Clock, AlignLeft, RefreshCw, Trash2, Settings, Pencil, Save, Sparkles, Brain, Lightbulb, Loader2, Award, ChevronRight, Activity, Bot, Plus, History, ChevronLeft, ChevronDown, Bell, BellRing, Volume2, VolumeX } from "lucide-react";
import { Task, TaskReminderLeadTime, NotificationTone } from "../types";
import { START_HOUR, END_HOUR, ROW_HEIGHT_PX, cn, format12Hour, formatNotificationTime } from "../lib/utils";
import { parseNaturalLanguageTask } from "../lib/naturalLanguage";
import { NOTIFICATION_TONES, playNotificationSound, unlockAudio } from "../lib/audio";
import { TaskCard } from "./TaskCard";
import { Sidebar } from "./Sidebar";
import { motion, AnimatePresence } from "motion/react";

const renderHourLabel = (hour: number) => {
  const displayHour = hour === 0 || hour === 24 ? 12 : hour % 12;
  const ampm = hour < 12 || hour === 24 ? "AM" : "PM";
  
  return (
    <div className="flex items-baseline justify-end gap-1 text-gray-400 dark:text-gray-500">
      <span className="text-[12px] font-medium">{displayHour}</span>
      <span className="text-[9px] font-bold uppercase">{ampm}</span>
    </div>
  );
};

let draggedTaskData: any = null;

const generateOfflineChecklist = (title: string, description: string) => {
  const lowTitle = title.toLowerCase();
  let subtasks: string[] = [];
  let shortTip = "";

  if (lowTitle.includes("study") || lowTitle.includes("learn") || lowTitle.includes("course") || lowTitle.includes("read") || lowTitle.includes("exam") || lowTitle.includes("book")) {
    subtasks = [
      "Prepare your study space, books, and reference material.",
      "Review the core learning objectives and concepts.",
      "Read through key notes or chapters systematically.",
      "Take structured summaries or solve key practice questions.",
      "Do a quick self-test and plan the next review session."
    ];
    shortTip = "Try the Pomodoro technique: study intensely for 25 minutes, then rest for 5.";
  } else if (lowTitle.includes("code") || lowTitle.includes("develop") || lowTitle.includes("program") || lowTitle.includes("software") || lowTitle.includes("build") || lowTitle.includes("app")) {
    subtasks = [
      "Define clean specifications and outline structural design.",
      "Set up files, clean code architecture, and initialize layout.",
      "Implement core algorithms and interface components.",
      "Debug errors and run tests in multiple environments.",
      "Review and commit clean code with well-structured documentation."
    ];
    shortTip = "Break your complex features down into simple, compilable chunks.";
  } else if (lowTitle.includes("gym") || lowTitle.includes("workout") || lowTitle.includes("run") || lowTitle.includes("exercise") || lowTitle.includes("sport") || lowTitle.includes("train")) {
    subtasks = [
      "Hydrate well and locate active athletic apparel.",
      "Begin with a 5-10 minute gentle stretch and warm-up.",
      "Execute high-intensity target training with good posture.",
      "Cool down with slow stretches and breathing exercises.",
      "Replenish nutrition and log performance benchmarks."
    ];
    shortTip = "Consistency beats intensity. Focus on proper form rather than high weight.";
  } else if (lowTitle.includes("clean") || lowTitle.includes("tidy") || lowTitle.includes("wash") || lowTitle.includes("organize") || lowTitle.includes("house") || lowTitle.includes("room")) {
    subtasks = [
      "Declutter surfaces and dispose of trash or recyclables.",
      "Wipe down main furniture, counters, and fixtures.",
      "Sweep, vacuum, or mop the target surface areas.",
      "Sort and store active items back in their correct locations.",
      "Enjoy the newly organized, fresh, and productive space."
    ];
    shortTip = "Cleaning the environment clears the mind. Focus on one zone at a time.";
  } else if (lowTitle.includes("meet") || lowTitle.includes("call") || lowTitle.includes("interview") || lowTitle.includes("talk") || lowTitle.includes("discussion")) {
    subtasks = [
      "Note down key agenda points or questions beforehand.",
      "Test audio, video, camera, and network links properly.",
      "Join exactly on time and listen attentively to points.",
      "Document key action items and decisions taken.",
      "Follow up with short summary notes or calendar updates."
    ];
    shortTip = "Listen 80% of the time, speak 20% of the time. Active listening gets results.";
  } else {
    subtasks = [
      "Clarify and outline the main objective of this task.",
      "Eliminate distractions and gather required tools.",
      "Focus intensely on implementing the primary steps.",
      "Review the draft, output, or quality for any mistakes.",
      "Mark as complete and take a brief, well-earned break!"
    ];
    shortTip = "The secret to getting things done is simply getting started. Take the first step.";
  }

  return { subtasks, shortTip };
};

interface TimelineProps {
  tasks: Task[];
  onToggleStatus: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (task: Task) => void;
  onAddTask?: (task: Omit<Task, 'id' | 'isCompleted'> & { recurrence?: string }) => void;
  selectedDate: string;
  onGridClick: (hour: number, minute: number, dateStr?: string, customEndTimeStr?: string, prefillTitle?: string) => void;
  view: 'day' | 'week' | 'month' | 'year';
  onViewChange: (v: 'day' | 'week' | 'month' | 'year') => void;
  setSelectedDate?: (d: string) => void;
  theme: any;
  setTheme: (t: any) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onAddTaskClick?: () => void;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
  onTriggerTestNotification?: () => void;
  enabledOffsets?: string[];
  onToggleOffset?: (offset: string) => void;
  defaultTone?: NotificationTone;
  onToneChange?: (tone: NotificationTone) => void;
}

export function Timeline({
  tasks,
  onToggleStatus,
  onDeleteTask,
  onUpdateTask,
  onAddTask,
  selectedDate,
  onGridClick,
  view,
  onViewChange,
  setSelectedDate,
  theme,
  setTheme,
  isSidebarOpen,
  onToggleSidebar,
  onAddTaskClick,
  isSoundEnabled = true,
  onToggleSound,
  onTriggerTestNotification,
  enabledOffsets = ['now', '5m', '10m'],
  onToggleOffset,
  defaultTone = 'chime',
  onToneChange
}: TimelineProps) {

  const baseDate = new Date(selectedDate + "T00:00:00");

  const displayDate = (() => {
    if (view === 'year') {
      return format(baseDate, "yyyy");
    }
    if (view === 'month') {
      return format(baseDate, "MMMM yyyy");
    }
    if (view === 'week') {
      const wStart = startOfWeek(baseDate, { weekStartsOn: 1 });
      const wEnd = addDays(wStart, 6);
      if (format(wStart, 'MMM') !== format(wEnd, 'MMM')) {
        return `${format(wStart, "MMM d")} - ${format(wEnd, "MMM d, yyyy")}`;
      }
      return `${format(wStart, "MMMM d")} - ${format(wEnd, "d, yyyy")}`;
    }
    return format(baseDate, "EEEE, MMMM do, yyyy");
  })();

  const hours = [];
  for (let i = START_HOUR; i <= END_HOUR; i++) {
    hours.push(i);
  }

  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editSelectedTaskOnOpen, setEditSelectedTaskOnOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    (typeof window !== "undefined" && 'Notification' in window && window.Notification) ? window.Notification.permission : "default"
  );

  const requestNotifPermission = async () => {
    if (typeof window !== "undefined" && 'Notification' in window && window.Notification) {
      const resp = await window.Notification.requestPermission();
      setNotifPermission(resp);
    }
  };

  // Draft event states matching Google Calendar tapping/holding behavior
  const [draftTask, setDraftTask] = useState<{
    date: string;
    startTime: string; // "HH:mm"
    endTime: string; // "HH:mm"
    title: string;
    color: 'blue' | 'green' | 'yellow' | 'red';
  } | null>(null);
  const [resizingHandle, setResizingHandle] = useState<'top' | 'bottom' | null>(null);

  // Resize window triggers
  useEffect(() => {
    if (!resizingHandle || !draftTask) return;

    const handleMove = (clientY: number) => {
      const gridElem = document.querySelector('.timeline-grid');
      if (!gridElem) return;

      const rect = gridElem.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      
      const totalMinutes = Math.round(relativeY / (ROW_HEIGHT_PX / 60) / 15) * 15;
      const hour = Math.max(0, Math.min(23, Math.floor(totalMinutes / 60)));
      const minute = Math.max(0, Math.min(45, totalMinutes % 60));
      const formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

      setDraftTask(prev => {
        if (!prev) return null;
        if (resizingHandle === 'top') {
          const [endH, endM] = prev.endTime.split(':').map(Number);
          const endTotal = endH * 60 + endM;
          const startTotal = hour * 60 + minute;
          
          if (startTotal >= endTotal) {
            const newStartTotal = Math.max(0, endTotal - 15);
            const cappedH = Math.floor(newStartTotal / 60);
            const cappedM = newStartTotal % 60;
            return {
              ...prev,
              startTime: `${cappedH.toString().padStart(2, '0')}:${cappedM.toString().padStart(2, '0')}`
            };
          }
          return { ...prev, startTime: formattedTime };
        } else {
          const [startH, startM] = prev.startTime.split(':').map(Number);
          const startTotal = startH * 60 + startM;
          const endTotal = hour * 60 + minute;
          
          if (endTotal <= startTotal) {
            const newEndTotal = Math.min(24 * 60 - 1, startTotal + 15);
            const cappedH = Math.floor(newEndTotal / 60);
            const cappedM = newEndTotal % 60;
            return {
              ...prev,
              endTime: `${cappedH.toString().padStart(2, '0')}:${cappedM.toString().padStart(2, '0')}`
            };
          }
          return { ...prev, endTime: formattedTime };
        }
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientY);
      }
    };

    const onMouseUp = () => {
      setResizingHandle(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [resizingHandle, draftTask]);

  const handleGridClick = (hour: number, minute: number, dateStr?: string) => {
    const targetDate = dateStr || selectedDate;
    const startStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    let endHour = hour;
    let endMin = minute + 60;
    if (endMin >= 60) {
      endHour += Math.floor(endMin / 60);
      endMin = endMin % 60;
    }
    if (endHour >= 24) {
      endHour = 23;
      endMin = 59;
    }
    const endStr = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
    
    setDraftTask({
      date: targetDate,
      startTime: startStr,
      endTime: endStr,
      title: "",
      color: "blue"
    });
  };

  const handleSaveDraft = () => {
    if (!draftTask) return;
    const parsedTask = parseNaturalLanguageTask(draftTask.title, draftTask.date);
    const finalTitle = parsedTask?.taskName.trim() || draftTask.title.trim() || "(No title)";
    const finalDate = parsedTask?.hasDate && parsedTask.date ? parsedTask.date : draftTask.date;
    const finalStartTime = parsedTask?.hasTime && parsedTask.startTime ? parsedTask.startTime : draftTask.startTime;
    const finalEndTime = parsedTask?.hasTime && parsedTask.endTime ? parsedTask.endTime : draftTask.endTime;
    if (finalEndTime <= finalStartTime) return;
    if (onAddTask) {
      onAddTask({
        title: finalTitle,
        date: finalDate,
        startTime: finalStartTime,
        endTime: finalEndTime,
        color: draftTask.color,
        isAllDay: false,
        description: "",
      });
    }
    setDraftTask(null);
  };

  const handleOpenMoreOptions = () => {
    if (!draftTask) return;
    const capturedTitle = draftTask.title;
    const capturedDate = draftTask.date;
    const capturedEndTime = draftTask.endTime;
    const [h, m] = draftTask.startTime.split(":").map(Number);
    setDraftTask(null); // close draft overlay before opening full modal
    onGridClick(h, m, capturedDate, capturedEndTime, capturedTitle);
  };
  const activeTask = tasks.find(t => t.id === selectedTaskId) || null;



  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const startTotalMinutes = START_HOUR * 60;
  let currentIndicatorTop = -1;
  if (currentTotalMinutes >= startTotalMinutes && currentTotalMinutes <= END_HOUR * 60) {
    currentIndicatorTop = ((currentTotalMinutes - startTotalMinutes) / 60) * ROW_HEIGHT_PX;
  }

  return (
    <>
      <div className="overflow-hidden bg-white flex flex-col h-full bg-[#fcfcfc] dark:bg-[#1C1C1E] w-full">
        <header className="flex-shrink-0 bg-white z-40 px-3 md:px-6 lg:px-8 py-2 md:py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between border-b border-google-grid dark:bg-stone-900 border-b-gray-100/5 dark:border-white/10 dark:text-gray-100 gap-2 sm:gap-1.5 select-none min-w-0 w-full">
        {/* Brand Logo and Name - Order 1 */}
        <div className="flex items-center gap-2.5 shrink-0 select-none">
          <svg 
            viewBox="0 0 100 100" 
            className="w-6 h-6 text-gray-900 dark:text-white shrink-0" 
            stroke="currentColor" 
            fill="none" 
            strokeWidth="10" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <rect x="10" y="10" width="80" height="80" rx="25" strokeWidth="10" />
            <line x1="32" y1="38" x2="68" y2="38" strokeWidth="10" />
            <line x1="32" y1="62" x2="68" y2="62" strokeWidth="10" />
          </svg>
          <span className="text-base font-black tracking-[0.15em] text-gray-900 dark:text-white shrink-0 font-sans uppercase">
            CHRONOS
          </span>
        </div>

        {/* Calendar Navigation & Selector - Order 3 on mobile (wrapped), Order 2 on desktop */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 w-full sm:w-auto justify-between sm:justify-start order-3 sm:order-none border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 dark:border-white/5 sm:border-r sm:border-gray-200 sm:dark:border-white/10 sm:pr-4">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button 
              onClick={() => setSelectedDate?.(format(new Date(), 'yyyy-MM-dd'))}
              className="px-2 md:px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 transition-colors shadow-sm dark:bg-stone-800 dark:border-white/10 dark:text-white dark:hover:bg-stone-700 shrink-0"
            >
              Today
            </button>
            
            <div className="flex items-center shrink-0">
              <button 
                onClick={() => {
                  if (view === 'day') setSelectedDate?.(format(addDays(baseDate, -1), 'yyyy-MM-dd'));
                  if (view === 'week') setSelectedDate?.(format(addWeeks(baseDate, -1), 'yyyy-MM-dd'));
                  if (view === 'month') setSelectedDate?.(format(addMonths(baseDate, -1), 'yyyy-MM-dd'));
                  if (view === 'year') {
                    const newDate = new Date(baseDate);
                    newDate.setFullYear(newDate.getFullYear() - 1);
                    setSelectedDate?.(format(newDate, 'yyyy-MM-dd'));
                  }
                }}
                className="p-1 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:text-white dark:hover:bg-stone-800"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <button 
                onClick={() => {
                  if (view === 'day') setSelectedDate?.(format(addDays(baseDate, 1), 'yyyy-MM-dd'));
                  if (view === 'week') setSelectedDate?.(format(addWeeks(baseDate, 1), 'yyyy-MM-dd'));
                  if (view === 'month') setSelectedDate?.(format(addMonths(baseDate, 1), 'yyyy-MM-dd'));
                  if (view === 'year') {
                    const newDate = new Date(baseDate);
                    newDate.setFullYear(newDate.getFullYear() + 1);
                    setSelectedDate?.(format(newDate, 'yyyy-MM-dd'));
                  }
                }}
                className="p-1 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:text-white dark:hover:bg-stone-800"
              >
                <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>
 
          {/* Shorter displayDate on mobile */}
          <span className="sm:hidden text-[11px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide shrink-0 bg-gray-100 dark:bg-stone-800 border border-gray-200 dark:border-white/10 px-2 py-1 rounded-md">
            {view === 'day' ? format(baseDate, "MMM d") : displayDate}
          </span>
          {/* Detailed displayDate on tablet/desktop */}
          <span className="hidden sm:inline-block text-xs lg:text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">
            {displayDate}
          </span>
 
          <div className="relative block ml-auto sm:ml-1 shrink-0">
            <select
              value={view}
              onChange={(e) => onViewChange(e.target.value as 'day' | 'week' | 'month' | 'year')}
              className="appearance-none bg-white dark:bg-stone-800 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white text-[11px] md:text-xs font-bold py-1.5 pl-2 pr-6 md:pr-7 rounded-md focus:outline-none focus:ring-2 focus:ring-google-blue/20 cursor-pointer shadow-sm transition-colors"
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center px-0.5 text-gray-500 dark:text-gray-400">
              <ChevronDown className="w-3 h-3" strokeWidth={1.75} />
            </div>
          </div>
        </div>
        
        {/* Actions panel - Order 2 on mobile (aligned right), Order 3 on desktop */}
        <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0 ml-auto sm:ml-0 order-2 sm:order-none">
          <button
            onClick={onToggleSidebar}
            className={cn(
              "h-8 px-2.5 flex items-center gap-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 select-none shadow-sm cursor-pointer border shrink-0 text-xs font-semibold",
              isSidebarOpen 
                ? "bg-google-blue hover:bg-blue-600 text-white border-google-blue focus:ring-blue-500" 
                : "bg-white hover:bg-blue-50/50 text-google-blue border-blue-200 dark:bg-stone-800 dark:border-white/10 dark:text-blue-300 dark:hover:bg-stone-700 focus:ring-blue-400"
            )}
            title={isSidebarOpen ? "Hide AI Assistant" : "Open Gemini Assistant & Voice Dictation"}
          >
            <Bot className="w-4 h-4" strokeWidth={2} />
            <span className="hidden sm:inline">AI Assistant</span>
          </button>


          <div className="relative hidden lg:block shrink-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm rounded-lg border border-google-grid dark:border-white/10 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-google-blue/20 w-32 xl:w-44 transition-all"
            />
          </div>

            {/* Notifications */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsBellOpen(!isBellOpen);
                  setIsSettingsOpen(false);
                }}
                className={cn(
                  "w-9 h-9 flex items-center justify-center rounded-lg border transition-colors",
                  isBellOpen
                    ? "bg-gray-100 text-gray-900 border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/15"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 dark:bg-stone-800 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/5"
                )}
                aria-label="Notifications"
                title="Notifications"
              >
                {isSoundEnabled && tasks.some((task) => task.date === format(currentTime, "yyyy-MM-dd") && !task.isCompleted)
                  ? <BellRing className="w-4 h-4 text-google-blue" />
                  : <Bell className="w-4 h-4" />}
                {tasks.some((task) => task.date === format(currentTime, "yyyy-MM-dd") && !task.isCompleted) && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500" />
                )}
              </button>
            </div>

            {/* Settings */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(!isSettingsOpen);
                  setIsBellOpen(false);
                }}
                className={cn(
                  "w-9 h-9 flex items-center justify-center rounded-lg border transition-colors",
                  isSettingsOpen
                    ? "bg-gray-100 text-gray-900 border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/15"
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 dark:bg-stone-800 dark:text-gray-300 dark:border-white/10 dark:hover:bg-white/5"
                )}
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              {isSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsSettingsOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1rem))] bg-white dark:bg-[#202124] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 p-4 z-50 max-h-[min(80vh,42rem)] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Settings</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Appearance and sound</p>
                      </div>
                      <button type="button" onClick={() => setIsSettingsOpen(false)} aria-label="Close settings" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <section aria-labelledby="theme-settings-title">
                      <h3 id="theme-settings-title" className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Theme</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'system', label: 'System', color: 'linear-gradient(135deg, #fff 50%, #202124 50%)' },
                          { id: 'white', label: 'Paper', color: '#ffffff' },
                          { id: 'gray', label: 'Cloud', color: '#e5e7eb' },
                          { id: 'black', label: 'Night', color: '#171717' },
                          { id: 'teal', label: 'Lagoon', color: '#c9eeea' },
                          { id: 'cyan', label: 'Sky', color: '#d8f1f7' },
                          { id: 'peach', label: 'Apricot', color: '#fae8c5' },
                          { id: 'coral', label: 'Coral', color: '#ffd9d5' },
                          { id: 'rose', label: 'Rose', color: '#f3dbe4' },
                          { id: 'sage', label: 'Sage', color: '#dce9d8' },
                        ].map((option) => (
                          <button key={option.id} type="button" role="radio" aria-checked={theme === option.id} onClick={() => setTheme(option.id)} className={cn("flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors", theme === option.id ? "border-google-blue bg-blue-50/70 text-gray-900 dark:bg-blue-950/30 dark:text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5")}>
                            <span className="w-5 h-5 shrink-0 rounded-md border border-black/10 dark:border-white/15" style={{ background: option.color }} />
                            <span className="flex-1">{option.label}</span>
                            {theme === option.id && <Check className="w-3.5 h-3.5 text-google-blue" />}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section aria-labelledby="sound-settings-title" className="mt-5 pt-4 border-t border-gray-100 dark:border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          {isSoundEnabled ? <Volume2 className="w-4 h-4 text-google-blue" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
                          <div>
                            <h3 id="sound-settings-title" className="text-xs font-semibold text-gray-900 dark:text-white">Reminder sound</h3>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{isSoundEnabled ? 'Sound is on' : 'Sound is off'}</p>
                          </div>
                        </div>
                        <button type="button" role="switch" aria-label="Reminder sound" aria-checked={isSoundEnabled} onClick={onToggleSound} className={cn("relative w-10 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-google-blue/40", isSoundEnabled ? "bg-google-blue" : "bg-gray-300 dark:bg-gray-600")}>
                          <span className={cn("absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform", isSoundEnabled && "translate-x-4")} />
                        </button>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <select aria-label="Reminder sound tone" value={defaultTone} onChange={(e) => { unlockAudio(); const nextTone = e.target.value as NotificationTone; onToneChange?.(nextTone); playNotificationSound(nextTone); }} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-google-blue/20 dark:border-white/10 dark:bg-[#292a2d] dark:text-gray-100">
                          {NOTIFICATION_TONES.map((tone) => <option key={tone.id} value={tone.id}>{tone.name}</option>)}
                        </select>
                        <button type="button" aria-label="Preview reminder sound" title="Preview sound" onClick={() => { unlockAudio(); playNotificationSound(defaultTone); }} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Calendar Views Container */}
        <div className="flex-1 relative flex flex-col bg-white dark:bg-stone-900 h-full overflow-hidden">
          <div className="flex-1 overflow-auto relative custom-scrollbar flex flex-col h-full w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="w-full h-full"
              >
                {view === 'day' && (
                   <DayView 
                     baseDate={baseDate} 
                     tasks={tasks} 
                     hours={hours} 
                     onGridClick={handleGridClick} 
                     onToggleStatus={onToggleStatus}
                     onDeleteTask={onDeleteTask} 
                     onUpdateTask={onUpdateTask}
                     currentIndicatorTop={currentIndicatorTop} 
                     currentTime={currentTime}
                     searchQuery={searchQuery}
                     onTaskClick={(task: any, edit = false) => {
                       setSelectedTaskId(task.id);
                       setEditSelectedTaskOnOpen(edit);
                     }}
                     draftTask={draftTask}
                     onStartResize={(handle: any, e: any) => setResizingHandle(handle)}
                     theme={theme}
                   />
                )}
                {view === 'week' && (
                   <WeekView 
                     baseDate={baseDate} 
                     tasks={tasks} 
                     hours={hours} 
                     onGridClick={handleGridClick} 
                     onToggleStatus={onToggleStatus}
                     onDeleteTask={onDeleteTask} 
                     onUpdateTask={onUpdateTask}
                     currentIndicatorTop={currentIndicatorTop} 
                     currentTime={currentTime}
                     setSelectedDate={setSelectedDate}
                     searchQuery={searchQuery}
                     onTaskClick={(task: any, edit = false) => {
                       setSelectedTaskId(task.id);
                       setEditSelectedTaskOnOpen(edit);
                     }}
                     draftTask={draftTask}
                     onStartResize={(handle: any, e: any) => setResizingHandle(handle)}
                     theme={theme}
                   />
                )}
                {view === 'month' && (
                   <MonthView 
                     baseDate={baseDate} 
                     tasks={tasks} 
                     onViewChange={onViewChange}
                     setSelectedDate={setSelectedDate}
                     onToggleStatus={onToggleStatus}
                     onDeleteTask={onDeleteTask}
                     onUpdateTask={onUpdateTask}
                     searchQuery={searchQuery}
                     onTaskClick={(task: any, edit = false) => {
                       setSelectedTaskId(task.id);
                       setEditSelectedTaskOnOpen(edit);
                     }}
                   />
                )}
                {view === 'year' && (
                   <YearView 
                     baseDate={baseDate} 
                     tasks={tasks} 
                     onViewChange={onViewChange}
                     setSelectedDate={setSelectedDate}
                     onToggleStatus={onToggleStatus}
                     onDeleteTask={onDeleteTask}
                     onUpdateTask={onUpdateTask}
                     searchQuery={searchQuery}
                     onTaskClick={(task: any) => setSelectedTaskId(task.id)}
                   />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {draftTask && (
            <div className="fixed inset-0 bg-stone-950/35 dark:bg-black/60 backdrop-blur-[3px] flex items-end sm:items-center justify-center z-[200] select-none animate-in fade-in duration-150 p-0 sm:p-5">
              <div className="bg-white dark:bg-[#1C1C1E] rounded-t-2xl sm:rounded-2xl border border-gray-200/80 dark:border-white/10 w-full max-w-lg shadow-2xl relative mx-auto overflow-hidden animate-in zoom-in-95 duration-150">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-white/10">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-google-blue">Quick add</p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-950 dark:text-white">New task</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close quick add"
                    onClick={() => setDraftTask(null)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Task title"
                    value={draftTask.title}
                    onChange={(e) => setDraftTask({ ...draftTask, title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveDraft();
                    }}
                    className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-white/[0.04] px-4 py-3 text-base font-medium text-gray-950 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-google-blue/30 focus:border-google-blue"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
                    <label className="min-w-0 flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Date</span>
                      <span className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2.5 focus-within:border-google-blue">
                        <CalendarIcon className="w-4 h-4 shrink-0 text-gray-400" />
                        <input
                          type="date"
                          value={draftTask.date}
                          onChange={(e) => setDraftTask({ ...draftTask, date: e.target.value })}
                          className="min-w-0 w-full bg-transparent text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                        />
                      </span>
                    </label>
                    <label className="min-w-0 flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Starts</span>
                      <span className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2.5 focus-within:border-google-blue">
                        <Clock className="w-4 h-4 shrink-0 text-gray-400" />
                        <input
                          type="time"
                          value={draftTask.startTime}
                          onChange={(e) => setDraftTask({ ...draftTask, startTime: e.target.value })}
                          className="min-w-0 w-full bg-transparent text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                        />
                      </span>
                    </label>
                    <label className="min-w-0 flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Ends</span>
                      <span className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2.5 focus-within:border-google-blue">
                        <Clock className="w-4 h-4 shrink-0 text-gray-400" />
                        <input
                          type="time"
                          value={draftTask.endTime}
                          onChange={(e) => setDraftTask({ ...draftTask, endTime: e.target.value })}
                          className="min-w-0 w-full bg-transparent text-sm text-gray-800 dark:text-gray-100 focus:outline-none"
                        />
                      </span>
                    </label>
                  </div>
                  {draftTask.endTime <= draftTask.startTime && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">End time must be after start time.</p>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Color</span>
                      <div className="flex gap-2">
                        {(['blue', 'green', 'yellow', 'red'] as const).map((col) => {
                          const colorsMap = {
                            blue: "bg-blue-500 ring-blue-300",
                            green: "bg-green-500 ring-green-300",
                            yellow: "bg-yellow-400 ring-yellow-200",
                            red: "bg-red-500 ring-red-300",
                          };
                          return (
                            <button
                              key={col}
                              type="button"
                              aria-label={`${col} task color`}
                              aria-pressed={draftTask.color === col}
                              onClick={() => setDraftTask({ ...draftTask, color: col })}
                              className={cn(
                                "w-5 h-5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer",
                                colorsMap[col],
                                draftTask.color === col ? "ring-2 ring-offset-2" : "hover:scale-110"
                              )}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleOpenMoreOptions}
                        className="px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      >
                        More options
                      </button>
                      <button
                        type="button"
                        disabled={draftTask.endTime <= draftTask.startTime}
                        onClick={handleSaveDraft}
                        className={cn(
                          "px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          (() => {
                            if (theme === 'teal') return "bg-[#5cb8b2] hover:bg-[#4ea19b] text-[#0c312f]";
                            if (theme === 'cyan') return "bg-[#6ed5ee] hover:bg-[#5bc1db] text-[#073642]";
                            if (theme === 'peach') return "bg-[#fcd891] hover:bg-[#e8c17b] text-[#422e03]";
                            if (theme === 'coral') return "bg-[#ff4040] hover:bg-[#e03030] text-white";
                            return "bg-google-blue hover:bg-blue-600 text-white";
                          })()
                        )}
                      >
                        Add task
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => onAddTaskClick?.()}
            className="absolute bottom-8 right-8 w-14 h-14 bg-google-blue hover:bg-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40 focus:outline-none focus:ring-4 focus:ring-blue-500/30 cursor-pointer"
            aria-label="Create new task"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* AI Assistant Sidebar Side Panel */}
        {isSidebarOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/40 z-40 md:hidden animate-in fade-in duration-200"
              onClick={onToggleSidebar}
            />
            <Sidebar 
              tasks={tasks}
              onAddTask={onAddTask || (() => {})} 
              onDeleteTask={onDeleteTask}
              onUpdateTask={onUpdateTask}
              selectedDate={selectedDate} 
              setSelectedDate={setSelectedDate || (() => {})} 
              onClose={onToggleSidebar}
            />
          </>
        )}
      </div>
    </div>
    <AnimatePresence>
      {activeTask && (
        <TaskDetailModal 
          key={activeTask.id}
          task={activeTask} 
          allTasks={tasks}
          startInEditMode={editSelectedTaskOnOpen}
          onClose={() => setSelectedTaskId(null)} 
          onToggleStatus={onToggleStatus} 
          onDeleteTask={onDeleteTask} 
          onUpdateTask={onUpdateTask} 
        />
      )}
    </AnimatePresence>

    {/* Notification panel rendered at root level so it escapes overflow-hidden and backdrop-filter stacking contexts */}
    {isBellOpen && (
      <>
        <div
          className="fixed inset-0 z-[150] bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBellOpen(false);
          }}
        />
        <div
          id="notification-panel"
          className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-16 sm:right-4 sm:left-auto w-full sm:w-[360px] sm:max-w-[calc(100vw-2rem)] bg-white dark:bg-[#202124] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-4 pb-6 z-[160] animate-in slide-in-from-bottom-full sm:slide-in-from-top-3 duration-150 max-h-[85vh] overflow-y-auto overflow-x-hidden"
        >
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-google-blue" strokeWidth={2} />
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">Notifications</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Browser and reminder status</p>
              </div>
            </div>
            <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setIsBellOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
          </div>

          <div className="flex flex-col gap-4 mt-4">
            {/* Push Notification permission control */}
            <div className="bg-gray-50 dark:bg-white/[0.04] p-3.5 rounded-xl border border-gray-100 dark:border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0b57d0] dark:bg-blue-450 animate-pulse" />
                  <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest font-sans">
                    Browser Push
                  </span>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-2.5 py-0.5 rounded-full border select-none",
                  notifPermission === "granted"
                    ? "bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800/20 dark:text-emerald-400"
                    : "bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-955/20 dark:border-amber-800/20 dark:text-amber-400"
                )}>
                  {notifPermission === "granted" ? "Granted" : notifPermission === "denied" ? "Blocked" : "Needs Setup"}
                </span>
              </div>
              {notifPermission !== "granted" ? (
                <button
                  onClick={requestNotifPermission}
                  className="w-full bg-google-blue hover:bg-blue-600 text-white text-xs font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Bell className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Unlock Desktop Notifications</span>
                </button>
              ) : (
                <p className="text-[10px] text-gray-500 dark:text-gray-450 leading-normal font-medium flex items-center gap-1.5">
                  <span className="text-emerald-500 font-bold text-sm">✓</span> Alerts configured on this browser.
                </p>
              )}
            </div>

            {/* Global Default Settings — iOS-style grouped card */}
            <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]">
              {/* Section label */}
              <div className="px-4 pt-3 pb-1.5 bg-gray-50 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/10">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Default reminder times
                </span>
              </div>

              {/* Audio Alerts row */}
              <div className="hidden">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-[9px] flex items-center justify-center transition-all",
                    isSoundEnabled
                      ? "bg-[#30d158] text-white"
                      : "bg-gray-200 dark:bg-[#3a3a3c] text-gray-500 dark:text-gray-400"
                  )}>
                    {isSoundEnabled
                      ? <Volume2 className="w-4 h-4" strokeWidth={2.25} />
                      : <VolumeX className="w-4 h-4" strokeWidth={2.25} />
                    }
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">Audio Alerts</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">Chime on reminder</p>
                  </div>
                </div>
                {/* iOS-style toggle */}
                <button
                  onClick={onToggleSound}
                  className={cn(
                    "relative w-[51px] h-[31px] rounded-full transition-colors duration-200 focus:outline-none cursor-pointer shrink-0",
                    isSoundEnabled ? "bg-[#34c759]" : "bg-[#e5e5ea] dark:bg-[#3a3a3c]"
                  )}
                  role="switch"
                  aria-checked={isSoundEnabled}
                >
                  <span className={cn(
                    "absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-transform duration-200",
                    isSoundEnabled ? "translate-x-[20px]" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* Notification Tone Row */}
              <div className="hidden">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[9px] bg-indigo-500 text-white flex items-center justify-center">
                    <BellRing className="w-4 h-4" strokeWidth={2.25} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">Notification Tone</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">Choose audio profile</p>
                  </div>
                </div>
                <select
                  value={defaultTone}
                  onChange={(e) => {
                    unlockAudio();
                    const newTone = e.target.value as NotificationTone;
                    onToneChange?.(newTone);
                    playNotificationSound(newTone); // Preview
                  }}
                  className="bg-transparent text-[13px] font-medium text-[#007aff] dark:text-[#a8c7fa] border-none focus:ring-0 cursor-pointer text-right appearance-none hover:opacity-80 transition-opacity pr-1"
                >
                  {NOTIFICATION_TONES.map(tone => (
                    <option key={tone.id} value={tone.id} className="bg-white dark:bg-stone-900 text-gray-900 dark:text-white">
                      {tone.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead-Times row */}
              <div className="px-4 py-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" strokeWidth={2.5} />
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Choose when to be reminded</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'now', label: 'At start' },
                    { id: '5m',  label: '5m early' },
                    { id: '10m', label: '10m early' },
                    { id: '15m', label: '15m early' },
                    { id: '30m', label: '30m early' },
                  ].map((offset) => {
                    const active = enabledOffsets.includes(offset.id);
                    return (
                      <button
                        key={offset.id}
                        onClick={() => onToggleOffset?.(offset.id)}
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer select-none",
                          active
                            ? "bg-google-blue text-white"
                            : "bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10"
                        )}
                      >
                        {active && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3 shrink-0">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {offset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Fast Alarm Simulation */}
            {onTriggerTestNotification && (
              <button
                onClick={() => {
                  onTriggerTestNotification();
                  setIsBellOpen(false);
                }}
                className="w-full bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/10 text-xs font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 border border-transparent"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Simulation Trigger</span>
              </button>
            )}

            {/* Upcoming lists */}
            <div className="border-t border-gray-100 dark:border-white/10 pt-4">
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-none">
                  Active Events ({tasks.filter(t => t.date === format(currentTime, "yyyy-MM-dd") && !t.isCompleted).length})
                </h4>
              </div>
              {tasks.filter(t => t.date === format(currentTime, "yyyy-MM-dd") && !t.isCompleted).length === 0 ? (
                <div className="text-center py-6 bg-gray-50 dark:bg-white/[0.03] rounded-xl border border-dashed border-gray-200 dark:border-white/10">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed px-4">
                    No upcoming reminders today.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
                  {tasks
                    .filter(t => t.date === format(currentTime, "yyyy-MM-dd") && !t.isCompleted)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .slice(0, 4)
                    .map((t, idx) => {
                      const colorIndicator: Record<string, string> = {
                        blue: "bg-blue-500",
                        green: "bg-emerald-500",
                        yellow: "bg-amber-500",
                        red: "bg-red-500",
                      };
                      const effectiveOffsets = (!t.reminderLeadTime || t.reminderLeadTime === 'default')
                        ? (enabledOffsets || ['now', '5m', '10m'])
                        : (t.reminderLeadTime === 'none' ? [] : [t.reminderLeadTime]);

                      const activeReminds = effectiveOffsets
                        .map(offsetId => {
                          let mins = 0;
                          if (offsetId === '5m') mins = 5;
                          else if (offsetId === '10m') mins = 10;
                          else if (offsetId === '15m') mins = 15;
                          else if (offsetId === '30m') mins = 30;
                          const [h, m] = (t.startTime || "12:00").split(':').map(Number);
                          const dObj = new Date();
                          dObj.setHours(h, m, 0, 0);
                          const targetDate = new Date(dObj.getTime() - mins * 60 * 1000);
                          const newH = targetDate.getHours().toString().padStart(2, '0');
                          const newM = targetDate.getMinutes().toString().padStart(2, '0');
                          const formattedTime = formatNotificationTime(`${newH}:${newM}`);
                          if (offsetId === 'now') return `Start (${formattedTime})`;
                          const label = offsetId === 'none' ? 'None' : offsetId;
                          return `${label} (${formattedTime})`;
                        });
                      return (
                        <div
                          key={t.id ? `${t.id}-${idx}` : `dyn-alert-${idx}`}
                          className="p-3 bg-white dark:bg-white/[0.03] rounded-lg border border-gray-200 dark:border-white/10 flex items-start gap-2.5"
                        >
                          <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", colorIndicator[t.color || 'blue'])} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <h4 className="text-xs font-semibold text-gray-805 dark:text-gray-100 truncate leading-tight">
                                {t.title}
                              </h4>
                              <span className="text-[10px] font-bold text-[#1a57db] dark:text-blue-300 font-sans shrink-0 bg-[#e8f0fe] dark:bg-blue-950/40 px-1.5 py-0.5 rounded-md">
                                {formatNotificationTime(t.startTime)}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal mt-1 flex items-center gap-1">
                              <span className="font-semibold text-gray-450 dark:text-gray-500 shrink-0">Alerts:</span>
                              <span className="truncate">{activeReminds.join(' • ')}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    )}
    </>
  );
}

export function getTaskLayouts(dayTasks: any[]) {
  const tasks = dayTasks.map(t => {
    const [sh, sm] = (t.startTime || "12:00").split(':').map(Number);
    const [eh, em] = (t.endTime || "13:00").split(':').map(Number);
    return {
       ...t,
       startMin: sh * 60 + sm,
       endMin: eh * 60 + em
    };
  }).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clusters: any[][] = [];
  let currentCluster: any[] = [];
  let clusterEnd = 0;

  for (const task of tasks) {
    if (task.startMin < clusterEnd) {
      currentCluster.push(task);
      clusterEnd = Math.max(clusterEnd, task.endMin);
    } else {
      if (currentCluster.length > 0) {
         clusters.push(currentCluster);
      }
      currentCluster = [task];
      clusterEnd = task.endMin;
    }
  }
  if (currentCluster.length > 0) {
     clusters.push(currentCluster);
  }

  const styles: Record<string, { width: string, left: string }> = {};

  for (const cluster of clusters) {
     const columns: any[][] = [];
     for (const task of cluster) {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
           const col = columns[i];
           const lastTask = col[col.length - 1];
           if (lastTask.endMin <= task.startMin) {
              col.push(task);
              placed = true;
              break;
           }
        }
        if (!placed) {
           columns.push([task]);
        }
     }

     const numCols = columns.length;
     for (let i = 0; i < numCols; i++) {
        for (const task of columns[i]) {
           styles[task.id] = {
              width: `calc(${100 / numCols}% - ${16 / numCols}px)`,
              left: `calc(${(100 / numCols) * i}% + 4px)`
           };
        }
     }
  }

  return styles;
}

interface TaskDetailModalProps {
  task: Task;
  startInEditMode?: boolean;
  onClose: () => void;
  onToggleStatus: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (task: Task) => void;
  allTasks: Task[];
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, startInEditMode = false, onClose, onToggleStatus, onDeleteTask, onUpdateTask, allTasks }) => {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const isMountingRef = React.useRef(true);

  useEffect(() => {
    const lockTimer = setTimeout(() => {
      isMountingRef.current = false;
    }, 120);
    return () => {
      clearTimeout(lockTimer);
    };
  }, []);

  const safeOnClose = () => {
    if (isMountingRef.current) return;
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        safeOnClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("none");
  const [editIsAllDay, setEditIsAllDay] = useState(false);
  const [editColor, setEditColor] = useState<"blue" | "green" | "yellow" | "red">("blue");
  const [editReminderLeadTime, setEditReminderLeadTime] = useState<TaskReminderLeadTime>("default");
  const [editSoundEnabled, setEditSoundEnabled] = useState<boolean>(true);
  const [editNotificationTone, setEditNotificationTone] = useState<NotificationTone>("chime");
  const [error, setError] = useState("");

  // Gemini Subtask Checklist states
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState("");

  const toggleSubTask = (subTaskId: string) => {
    if (!task || !task.subTasks) return;
    const updated = task.subTasks.map((item: any) => 
      item.id === subTaskId ? { ...item, done: !item.done } : item
    );
    onUpdateTask({
      ...task,
      subTasks: updated
    });
  };

  const clearActionPlan = () => {
    onUpdateTask({
      ...task,
      subTasks: undefined,
      focusTip: undefined
    });
  };

  const generateChecklist = async () => {
    if (!task) return;
    setLoadingChecklist(true);
    setChecklistError("");
    try {
      let data;
      if (!navigator.onLine) {
        data = generateOfflineChecklist(task.title, task.description || "");
      } else {
        try {
          const res = await fetch("/api/task-checklist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: task.title, description: task.description || "" })
          });
          if (!res.ok) {
            let errMsg = "Could not construct subtasks action plan.";
            try {
              const errData = await res.json();
              if (errData && errData.error) errMsg = errData.error;
            } catch { /* ignored */ }
            throw new Error(errMsg);
          }
          data = await res.json();
        } catch {
          data = generateOfflineChecklist(task.title, task.description || "");
        }
      }
      
      const items = (data.subtasks || []).map((text: string, index: number) => ({
        id: `gt-${Date.now()}-${index}`,
        text,
        done: false
      }));
      
      onUpdateTask({
        ...task,
        subTasks: items,
        focusTip: data.shortTip || ""
      });
    } catch (err: any) {
      setChecklistError(err.message || "Failed to generate your action checklist.");
    } finally {
      setLoadingChecklist(false);
    }
  };

  const handleStartTimeChange = (newStart: string) => {
    setEditStartTime(newStart);
    if (!newStart) return;

    const [startH, startM] = (editStartTime || "00:00").split(":").map(Number);
    const [endH, endM] = (editEndTime || "00:00").split(":").map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    let duration = endMins - startMins;
    if (isNaN(duration) || duration <= 0) {
      duration = 60;
    }

    const [newStartH, newStartM] = newStart.split(":").map(Number);
    if (!isNaN(newStartH) && !isNaN(newStartM)) {
      let newEndMins = newStartH * 60 + newStartM + duration;
      if (newEndMins >= 1440) {
        newEndMins = 1439;
      }
      const newEndH = Math.floor(newEndMins / 60);
      const newEndM = newEndMins % 60;
      const newEndStr = `${String(newEndH).padStart(2, "0")}:${String(newEndM).padStart(2, "0")}`;
      setEditEndTime(newEndStr);
    }
  };

  const prevTaskIdRef = useRef<string | null>(null);

  const handleStartEdit = () => {
    setEditTitle(task.title || "");
    setEditDescription(task.description || "");
    setEditDate(task.date || "");
    setEditStartTime(task.startTime || "09:00");
    setEditEndTime(task.endTime || "10:00");
    setEditRecurrence(task.originalRecurrence || "none");
    setEditIsAllDay(!!task.isAllDay);
    setEditColor(task.color || "blue");
    setEditReminderLeadTime(task.reminderLeadTime || "default");
    setEditSoundEnabled(task.soundEnabled !== undefined ? task.soundEnabled : true);
    setEditNotificationTone(task.notificationTone || "chime");
    setError("");
    setIsEditing(true);
  };

  useEffect(() => {
    if (task) {
      if (prevTaskIdRef.current !== task.id) {
        prevTaskIdRef.current = task.id;
        setEditTitle(task.title || "");
        setEditDescription(task.description || "");
        setEditDate(task.date || "");
        setEditStartTime(task.startTime || "09:00");
        setEditEndTime(task.endTime || "10:00");
        setEditRecurrence(task.originalRecurrence || "none");
        setEditIsAllDay(!!task.isAllDay);
        setEditColor(task.color || "blue");
        setEditReminderLeadTime(task.reminderLeadTime || "default");
        setEditSoundEnabled(task.soundEnabled !== undefined ? task.soundEnabled : true);
        setEditNotificationTone(task.notificationTone || "chime");
        setIsEditing(startInEditMode);
        setError("");
      }
    }
  }, [task, startInEditMode]);

  const handleSave = (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editTitle.trim()) {
      setError("Please enter a task name.");
      return;
    }

    if (!editIsAllDay) {
      const timeToMins = (time: string) => {
        const [h, m] = (time || "00:00").split(":").map(Number);
        return h * 60 + m;
      };
      
      const startMins = timeToMins(editStartTime);
      const endMins = timeToMins(editEndTime);

      if (endMins <= startMins) {
        setError("End time must be after start time.");
        return;
      }
    }

    setError("");
    const updatedTask: Task = {
      ...task,
      title: editTitle.trim(),
      description: editDescription.trim(),
      date: editDate,
      startTime: editIsAllDay ? "00:00" : editStartTime,
      endTime: editIsAllDay ? "23:59" : editEndTime,
      isAllDay: editIsAllDay,
      color: editColor,
      originalRecurrence: editRecurrence,
      reminderLeadTime: editReminderLeadTime,
      soundEnabled: editSoundEnabled,
      notificationTone: editNotificationTone,
    };

    onUpdateTask(updatedTask);
    onClose();
    setIsEditing(false);
  };

  const categoryMap = {
    blue: { name: "Work", color: "#007AFF", bg: "bg-blue-100", text: "text-[#007AFF]" },
    green: { name: "Health", color: "#34C759", bg: "bg-green-100", text: "text-[#34C759]" },
    yellow: { name: "Personal", color: "#FF9500", bg: "bg-orange-100", text: "text-[#FF9500]" },
    red: { name: "Urgent", color: "#FF3B30", bg: "bg-red-100", text: "text-[#FF3B30]" }
  } as any;
  
  const activeCategory = categoryMap[task.color || "blue"] || categoryMap.blue;
  const recurrenceLabel = (!task.originalRecurrence || task.originalRecurrence === 'none') ? "Does not repeat" : task.originalRecurrence.charAt(0).toUpperCase() + task.originalRecurrence.slice(1);

  return createPortal(
    <div 
      id="task-detail-overlay"
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" 
      style={{ backgroundColor: 'rgba(23, 23, 23, 0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget || (e.target instanceof HTMLElement && e.target.id === 'task-detail-overlay')) {
          safeOnClose();
        }
      }}
    >
      <motion.div 
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        className="bg-white dark:bg-[#1C1C1E] rounded-t-[14px] sm:rounded-[14px] shadow-2xl w-full sm:max-w-lg overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[min(850px,94vh)] mx-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <>
            {/* Flat & Seamless Header */}
            <div className="px-8 py-6 bg-white dark:bg-[#1C1C1E] flex items-center justify-between shrink-0">
              <button 
                onClick={() => setIsEditing(false)}
                className="text-[15px] font-medium text-[#8E8E93] hover:text-black dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <h2 className="text-[15px] font-bold text-black dark:text-white">Edit Event</h2>
              <button 
                onClick={handleSave}
                className="text-[15px] font-bold text-[#007AFF] hover:opacity-70 transition-opacity"
              >
                Done
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-4 space-y-10 custom-scrollbar">
              {/* Group 1: Details - Frameless & Borderless */}
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-transparent text-[22px] font-semibold focus:outline-none text-black dark:text-white placeholder:text-[#E2E2E2] dark:placeholder:text-[#3A3A3C]"
                  placeholder="Title"
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full bg-transparent text-[14px] text-[#8E8E93] focus:outline-none placeholder:text-[#E2E2E2] dark:placeholder:text-[#3A3A3C] resize-none h-20"
                  placeholder="Add description or notes"
                />
              </div>

              {/* Group 2: Timing - Minimalist Inline (Stacked) */}
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 text-[14px]">
                  <div className="flex items-center gap-4 text-black dark:text-white">
                    <span className="font-medium w-12 shrink-0">Starts</span>
                    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="bg-transparent focus:outline-none cursor-pointer w-[110px]"
                      />
                      {!editIsAllDay && (
                        <input
                          type="time"
                          value={editStartTime}
                          onChange={(e) => handleStartTimeChange(e.target.value)}
                          className="bg-transparent focus:outline-none cursor-pointer w-[65px]"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-black dark:text-white">
                    <span className="font-medium w-12 shrink-0">Ends</span>
                    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer">
                      <input
                        type="date"
                        value={editDate}
                        className="bg-transparent focus:outline-none cursor-pointer w-[110px]"
                        readOnly
                      />
                      {!editIsAllDay && (
                        <input
                          type="time"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                          className="bg-transparent focus:outline-none cursor-pointer w-[65px]"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 mt-2">
                  <div className="flex items-center gap-8 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#8E8E93]">All-Day</span>
                      <button
                        type="button"
                        onClick={() => setEditIsAllDay(!editIsAllDay)}
                        className={cn(
                          "relative w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none shrink-0",
                          editIsAllDay ? "bg-[#34C759]" : "bg-[#E9E9EB] dark:bg-[#39393D]"
                        )}
                      >
                        <motion.div 
                          animate={{ x: editIsAllDay ? 12 : 2 }}
                          className="absolute top-[2px] w-3 h-3 rounded-full bg-white shadow-sm"
                        />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 group cursor-pointer">
                      <span className="text-[#8E8E93]">Repeat</span>
                      <div className="flex items-center gap-0.5">
                        <select
                          value={editRecurrence}
                          onChange={(e) => setEditRecurrence(e.target.value)}
                          className="appearance-none bg-transparent text-black dark:text-white focus:outline-none cursor-pointer pr-1 font-medium"
                        >
                          <option value="none">None</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        <ChevronRight className="w-3.5 h-3.5 text-[#C4C4C6]" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 group cursor-pointer text-[13px]">
                    <span className="text-[#8E8E93]">Alert</span>
                    <div className="flex items-center gap-0.5">
                      <select
                        value={editReminderLeadTime}
                        onChange={(e) => setEditReminderLeadTime(e.target.value as any)}
                        className="appearance-none bg-transparent text-black dark:text-white focus:outline-none cursor-pointer pr-1 font-medium"
                      >
                        {[
                          { value: 'none', label: 'None' },
                          { value: 'default', label: '30 minutes before' },
                          { value: 'at_time', label: 'At time of event' },
                          { value: '5m', label: '5 minutes before' },
                          { value: '10m', label: '10 minutes before' },
                          { value: '15m', label: '15 minutes before' },
                          { value: '1h', label: '1 hour before' },
                          { value: '1d', label: '1 day before' },
                        ].map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronRight className="w-3.5 h-3.5 text-[#C4C4C6]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 3: Categories - Horizontal Pills */}
              <div className="flex flex-col gap-3">
                <span className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wider">Calendar</span>
                <div className="flex flex-wrap gap-2">
                    {(['blue', 'green', 'yellow', 'red'] as const).map((col) => {
                      const colors = {
                        blue: { name: 'Work', color: '#007AFF', bg: 'bg-[#007AFF]/10', darkBg: 'dark:bg-[#007AFF]/20' },
                        green: { name: 'Health', color: '#34C759', bg: 'bg-[#34C759]/10', darkBg: 'dark:bg-[#34C759]/20' },
                        yellow: { name: 'Personal', color: '#FF9500', bg: 'bg-[#FF9500]/10', darkBg: 'dark:bg-[#FF9500]/20' },
                        red: { name: 'Urgent', color: '#FF3B30', bg: 'bg-[#FF3B30]/10', darkBg: 'dark:bg-[#FF3B30]/20' }
                      };
                      const cat = colors[col];
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setEditColor(col)}
                          className={cn(
                            "px-4 py-1.5 rounded-full flex items-center gap-2 border transition-all text-[13px] font-medium",
                            editColor === col 
                              ? `${cat.bg} ${cat.darkBg} border-transparent text-black dark:text-white`
                              : "bg-transparent border-gray-100 dark:border-[#38383A] text-[#8E8E93] hover:border-gray-200 dark:hover:border-gray-700"
                          )}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </button>
                      );
                    })}
                </div>
              </div>

              {error && (
                <div className="px-4 text-[13px] text-[#FF3B30] font-medium">{error}</div>
              )}

              <div className="pt-4">
                 <button
                  type="button"
                  onClick={() => {
                    onDeleteTask(task.id);
                    onClose();
                  }}
                  className="text-[#FF3B30] text-[14px] font-semibold hover:opacity-70 transition-opacity"
                >
                  Delete Event
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Flat & Seamless Header */}
            <div className="px-8 py-6 bg-white dark:bg-[#1C1C1E] flex items-center justify-between shrink-0">
               <div className="flex items-center gap-3">
                 <div className={cn("w-2 h-2 rounded-full shadow-sm", task.color === 'blue' ? 'bg-[#007AFF]' : task.color === 'green' ? 'bg-[#34C759]' : task.color === 'yellow' ? 'bg-[#FF9500]' : 'bg-[#FF3B30]')} />
                 <span className="text-[14px] font-bold text-black dark:text-white uppercase tracking-wider">{activeCategory.name}</span>
               </div>
               <h2 className="text-[15px] font-bold text-black dark:text-white absolute left-1/2 -translate-x-1/2">Event Details</h2>
               <button 
                onClick={onClose}
                className="text-[15px] font-medium text-[#8E8E93] hover:text-black dark:hover:text-white transition-colors"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-4 space-y-10 custom-scrollbar">
              {/* Event Title Block */}
              <div className="flex flex-col gap-2">
                <h1 className={cn("text-[24px] font-bold text-black dark:text-white leading-tight", task.isCompleted && "opacity-50 line-through")}>
                  {task.title}
                </h1>
                {task.description && (
                  <p className="text-[15px] text-[#8E8E93] leading-relaxed">
                    {task.description}
                  </p>
                )}
              </div>

              {/* Minimalist Information - Stacked & Frameless */}
              <div className="flex flex-col gap-6 text-[14px]">
                {/* Time Row */}
                <div className="flex items-center gap-4 text-black dark:text-white">
                  <span className="w-12 text-[#8E8E93] font-medium">Time</span>
                  <span className="font-semibold">
                    {task.isAllDay ? "All-Day" : `${format12Hour(task.startTime)} to ${format12Hour(task.endTime)}`}
                  </span>
                </div>

                {/* Date Row */}
                <div className="flex items-center gap-4 text-black dark:text-white">
                  <span className="w-12 text-[#8E8E93] font-medium">Date</span>
                  <span className="font-semibold">
                    {format(new Date(task.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
                  </span>
                </div>

                {/* Repeat Row */}
                <div className="flex items-center justify-between text-black dark:text-white group cursor-pointer w-fit gap-8">
                  <div className="flex items-center gap-4">
                    <span className="w-12 text-[#8E8E93] font-medium">Repeat</span>
                    <span className="font-semibold">{recurrenceLabel}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#C4C4C6]" />
                </div>

                {/* Alert Row */}
                <div className="flex items-center justify-between text-black dark:text-white group cursor-pointer w-fit gap-8">
                   <div className="flex items-center gap-4">
                     <span className="w-12 text-[#8E8E93] font-medium">Alert</span>
                     <span className="font-semibold">{formatNotificationTime(task.reminderLeadTime || 'default')}</span>
                   </div>
                   <ChevronRight className="w-3.5 h-3.5 text-[#C4C4C6]" />
                </div>

                {/* Minimalist Action Plan Section */}
                <div className="flex flex-col gap-6 pt-4 border-t border-gray-100 dark:border-white/5">
                   {!task.subTasks || task.subTasks.length === 0 ? (
                     <div className="flex flex-col gap-1 items-start">
                       <button
                         onClick={generateChecklist}
                         disabled={loadingChecklist}
                         className="text-[14px] font-bold text-[#007AFF] hover:opacity-70 transition-opacity flex items-center gap-1.5"
                       >
                         {loadingChecklist ? (
                           <Loader2 className="w-3.5 h-3.5 animate-spin" />
                         ) : (
                           <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                         )}
                         Generate Action Plan
                       </button>
                       <p className="text-[12px] text-[#8E8E93] ml-5">
                         Optimize focus and execution for this event.
                       </p>
                     </div>
                   ) : (
                     <div className="space-y-5 animate-in fade-in duration-300">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <Sparkles className="w-3.5 h-3.5 text-[#007AFF]" />
                           <span className="text-[12px] font-bold text-black dark:text-white uppercase tracking-wider">Action Plan</span>
                         </div>
                         <button
                           onClick={clearActionPlan}
                           className="text-[11px] font-bold text-[#FF3B30] hover:opacity-70 transition-opacity uppercase tracking-wider"
                         >
                           Clear
                         </button>
                       </div>
                       
                       {task.focusTip && (
                         <div className="bg-blue-50/50 dark:bg-blue-500/5 p-3 rounded-lg">
                           <p className="text-[13px] text-blue-700 dark:text-blue-300 italic font-medium leading-relaxed">
                             "{task.focusTip}"
                           </p>
                         </div>
                       )}

                       <div className="flex flex-col gap-4">
                         {task.subTasks.map((item: any, idx: number) => (
                           <div key={item.id ? `${item.id}-${idx}` : `subtask-${idx}`} className="flex items-start gap-4 group">
                             <div 
                               onClick={() => toggleSubTask(item.id)}
                               className={cn(
                                 "w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all",
                                 item.done 
                                   ? "bg-[#34C759] border-[#34C759]" 
                                   : "border-[#C6C6C8] dark:border-[#38383A] hover:border-[#007AFF]"
                               )}
                             >
                               {item.done && <Check className="w-3 h-3 text-white" strokeWidth={4} />}
                             </div>
                             <span 
                               className={cn(
                                 "text-[14px] font-medium leading-snug cursor-pointer transition-all",
                                 item.done ? "text-[#8E8E93] line-through opacity-70" : "text-black dark:text-white"
                               )}
                               onClick={() => toggleSubTask(item.id)}
                             >
                               {item.text}
                             </span>
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                </div>
              </div>

              <div className="h-4" /> {/* Extra spacing at bottom */}
            </div>

            {/* iOS System Toolbars Actions */}
            <div className="px-8 py-6 bg-white dark:bg-[#1C1C1E] border-t border-gray-100 dark:border-white/5 flex items-center justify-between shrink-0">
                <button
                  onClick={handleStartEdit}
                  className="flex flex-col items-center gap-1 text-[#007AFF] hover:opacity-70 transition-opacity cursor-pointer"
                >
                  <Pencil className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Edit</span>
                </button>

                <button
                  onClick={() => onToggleStatus(task.id)}
                  className={cn(
                    "px-10 py-3 rounded-full font-bold text-[15px] shadow-lg active:scale-95 transition-all",
                    task.isCompleted 
                      ? "bg-gray-100 dark:bg-white/5 text-[#8E8E93]" 
                      : "bg-black dark:bg-white text-white dark:text-black"
                  )}
                >
                  {task.isCompleted ? "Completed" : "Complete Task"}
                </button>

                <button
                  onClick={() => {
                    onDeleteTask(task.id);
                    onClose();
                  }}
                  className="flex flex-col items-center gap-1 text-[#FF3B30] hover:opacity-70 transition-opacity"
                >
                  <Trash2 className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Trash</span>
                </button>
            </div>
          </>
        )}
      </motion.div>
    </div>,
    document.body
  );
}

function DraftTaskCard({ 
  draftTask, 
  onStartResize, 
  currentTheme 
}: { 
  draftTask: any; 
  onStartResize: (handle: 'top' | 'bottom', e: any) => void;
  currentTheme: string;
}) {
  const [startH, startM = 0] = draftTask.startTime.split(':').map(Number);
  const [endH, endM = 0] = draftTask.endTime.split(':').map(Number);
  
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  const durationMins = endMins - startMins;

  const top = (startMins / 60) * ROW_HEIGHT_PX;
  const height = (durationMins / 60) * ROW_HEIGHT_PX;

  let bgClass = "bg-[#2979FF]/85 text-white border-[#2979FF]";
  let accentColor = "#1a73e8";

  if (currentTheme === 'teal') {
    bgClass = "bg-[#5cb8b2]/90 text-[#0c312f] border-[#3e9e97]";
    accentColor = "#5cb8b2";
  } else if (currentTheme === 'cyan') {
    bgClass = "bg-[#6ed5ee]/90 text-[#073642] border-[#4bbbd6]";
    accentColor = "#6ed5ee";
  } else if (currentTheme === 'peach') {
    bgClass = "bg-[#fcd891]/95 text-[#422e03] border-[#e2b050]";
    accentColor = "#fcd891";
  } else if (currentTheme === 'coral') {
    bgClass = "bg-[#ff4040]/90 text-white border-[#e02020]";
    accentColor = "#ff4040";
  } else if (currentTheme === 'black') {
    bgClass = "bg-stone-800/90 text-white border-stone-600";
    accentColor = "#1c1c1e";
  } else if (currentTheme === 'gray') {
    bgClass = "bg-gray-600/90 text-white border-gray-500";
    accentColor = "#4b5563";
  }

  const format12H = (h: number, m: number) => {
    const displayHour = h === 0 || h === 12 ? 12 : h % 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const startLabel = format12H(startH, startM);
  const endLabel = format12H(endH, endM);

  return (
    <div
      className={cn(
        "absolute left-1 right-2 rounded-lg border shadow-xl p-2 select-none z-45 pointer-events-auto flex flex-col justify-between overflow-visible timeline-draft-card",
        bgClass
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        borderColor: accentColor,
      }}
    >
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartResize('top', e);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onStartResize('top', e);
        }}
        className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 cursor-ns-resize z-50 flex items-center justify-center hover:scale-125 transition-transform"
        style={{ borderColor: accentColor }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }}></div>
      </div>

      <div className="flex flex-col h-full pointer-events-none pr-1 justify-center">
        <span className="font-semibold text-xs leading-tight uppercase tracking-wider opacity-90 block">
          New Event
        </span>
        <span className="text-[10px] font-mono opacity-80 mt-0.5">
          {startLabel} - {endLabel}
        </span>
      </div>

      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartResize('bottom', e);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          onStartResize('bottom', e);
        }}
        className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-white shadow-md border-2 cursor-ns-resize z-50 flex items-center justify-center hover:scale-125 transition-transform"
        style={{ borderColor: accentColor }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }}></div>
      </div>
    </div>
  );
}

function DayView({ baseDate, tasks, hours, onGridClick, onToggleStatus, currentIndicatorTop, currentTime, searchQuery = "", onTaskClick, onDeleteTask, onUpdateTask, draftTask, onStartResize, theme }: any) {
  const [dragPreview, setDragPreview] = useState<{ task: any, minuteLabel: string, top: number } | null>(null);
  const lastTouchEndRef = React.useRef(0);

  const dateStr = format(baseDate, 'yyyy-MM-dd');
  const todaysTasks = tasks.filter((t: any) => t.date === dateStr);
  const allDayTasks = todaysTasks.filter((t: any) => t.isAllDay);
  const timedTasks = todaysTasks.filter((t: any) => !t.isAllDay);
  const isTodayDate = format(new Date(), 'yyyy-MM-dd') === dateStr;

  const isMatch = (t: any) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase());
  const layouts = getTaskLayouts(timedTasks);

  return (
    <div className="flex-1 flex flex-col min-h-max pb-8 relative w-full">
      <div className="sticky top-0 z-30 flex bg-white dark:bg-stone-900 border-b border-google-grid dark:border-white/10 shrink-0 shadow-sm w-full">
        <div className="w-20 border-r border-google-grid dark:border-white/10 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0 px-2 text-center leading-tight">All-Day</span>
        </div>
        <div 
          className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto max-h-32 custom-scrollbar relative"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            e.stopPropagation();
            let task = (window as any).draggedTaskData;
            if (!task) {
              const taskStr = e.dataTransfer.getData("application/json");
              if (taskStr) {
                try {
                  task = JSON.parse(taskStr);
                } catch (_) {}
              }
            }
            if (!task) return;
            if (onUpdateTask) {
              onUpdateTask({ ...task, date: dateStr, isAllDay: true });
            }
          }}
        >
          {allDayTasks.length === 0 && (
            <div className="text-[10px] font-medium text-gray-400 italic px-2 py-1">No all-day events</div>
          )}
          {allDayTasks.map((t: any, idx: number) => <AllDayItem key={t.id ? `${t.id}-${idx}` : `allday-${idx}`} task={t} onToggleStatus={onToggleStatus} isSearchMatch={isMatch(t)} onTaskClick={onTaskClick} onDeleteTask={onDeleteTask} />)}
        </div>
      </div>

      <div className="flex-1 flex relative w-full">
        <div className="w-20 border-r border-gray-100 dark:border-white/10 flex flex-col pt-4 select-none flex-shrink-0 bg-white dark:bg-stone-900 z-10">
          {hours.map((hour: number) => {
            return (
              <div
                key={hour}
                className="flex items-start justify-end pr-3"
                style={{ height: hour === 24 ? "0px" : `${ROW_HEIGHT_PX}px` }}
              >
                <div className="-mt-2.5">{renderHourLabel(hour)}</div>
              </div>
            );
          })}
        </div>

        <div 
          className="flex-1 relative w-full"
          onDragOver={e => {
             e.preventDefault();
             const task = (window as any).draggedTaskData;
             if (!task) return;
             
             const rect = e.currentTarget.getBoundingClientRect();
             const y = e.clientY - rect.top - 16;
             
             const fraction = Math.floor(y / (ROW_HEIGHT_PX / 4));
             let newStartHour = START_HOUR + Math.floor(fraction / 4);
             let newStartMinute = (fraction % 4) * 15;
             
             newStartHour = Math.max(START_HOUR, Math.min(newStartHour, END_HOUR));
             if (newStartHour === END_HOUR) newStartMinute = 0;
             
             const oldStartParts = task.startTime ? task.startTime.split(':').map(Number) : [12, 0];
             const oldEndParts = task.endTime ? task.endTime.split(':').map(Number) : [13, 0];
             const durationParams = (oldEndParts[0] * 60 + oldEndParts[1]) - (oldStartParts[0] * 60 + oldStartParts[1]);
             const duration = durationParams > 0 ? durationParams : 60;
             
             let totalNewEndMins = (newStartHour * 60) + newStartMinute + duration;
             let newEndHour = Math.floor(totalNewEndMins / 60);
             let newEndMin = totalNewEndMins % 60;
             
             if (newEndHour > END_HOUR + 1 || (newEndHour === END_HOUR + 1 && newEndMin > 0)) {
                newEndHour = END_HOUR + 1;
                newEndMin = 0;
             }
             
             const newStartStr = `${newStartHour.toString().padStart(2, '0')}:${newStartMinute.toString().padStart(2, '0')}`;
             const newEndStr = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;
             
             const newTop = (newStartHour - START_HOUR + newStartMinute / 60) * ROW_HEIGHT_PX;
             setDragPreview(prev => {
               if (prev && prev.top === newTop && prev.task.date === dateStr) return prev;
               return {
                 task: { ...task, date: dateStr, startTime: newStartStr, endTime: newEndStr, isAllDay: false },
                 minuteLabel: `:${newStartMinute.toString().padStart(2, '0')}`,
                 top: newTop
               };
             });
          }}
          onDragLeave={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const outOfBounds = 
              e.clientX !== 0 && e.clientY !== 0 && (
                e.clientX < rect.left ||
                e.clientX >= rect.right ||
                e.clientY < rect.top ||
                e.clientY >= rect.bottom
              );
            if (outOfBounds || (!e.relatedTarget && e.clientX === 0)) {
              setDragPreview(null);
            } else if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragPreview(null);
            }
          }}
          onDrop={e => {
            e.preventDefault();
            e.stopPropagation();
            setDragPreview(null);
            let task = (window as any).draggedTaskData;
            if (!task) {
              const taskStr = e.dataTransfer.getData("application/json");
              if (taskStr) {
                try {
                  task = JSON.parse(taskStr);
                } catch (_) {}
              }
            }
            if (!task) return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top - 16;
            
            const fraction = Math.floor(y / (ROW_HEIGHT_PX / 4));
            let newStartHour = START_HOUR + Math.floor(fraction / 4);
            let newStartMinute = (fraction % 4) * 15;
            
            newStartHour = Math.max(START_HOUR, Math.min(newStartHour, END_HOUR));
            if (newStartHour === END_HOUR) newStartMinute = 0;
            
            const oldStartParts = task.startTime ? task.startTime.split(':').map(Number) : [12, 0];
            const oldEndParts = task.endTime ? task.endTime.split(':').map(Number) : [13, 0];
            const durationParams = (oldEndParts[0] * 60 + oldEndParts[1]) - (oldStartParts[0] * 60 + oldStartParts[1]);
            const duration = durationParams > 0 ? durationParams : 60;
            
            let totalNewEndMins = (newStartHour * 60) + newStartMinute + duration;
            let newEndHour = Math.floor(totalNewEndMins / 60);
            let newEndMin = totalNewEndMins % 60;
            
            if (newEndHour > END_HOUR + 1 || (newEndHour === END_HOUR + 1 && newEndMin > 0)) {
               newEndHour = END_HOUR + 1;
               newEndMin = 0;
            }
            
            const newStartStr = `${newStartHour.toString().padStart(2, '0')}:${newStartMinute.toString().padStart(2, '0')}`;
            const newEndStr = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;
            
            if (onUpdateTask) {
              onUpdateTask({ ...task, date: dateStr, startTime: newStartStr, endTime: newEndStr, isAllDay: false });
            }
          }}
        >
          <div className="timeline-grid h-full w-full absolute top-4 bottom-0 left-0 right-0">
            {hours.map((hour: number) => {
              let touchTimeout: any = null;
              let hasMoved = false;
              let startY = 0;

              return (
                <div
                  key={`grid-${hour}`}
                  onClick={(e) => {
                    // Ignore clicks that originate from touch events
                    if (Date.now() - lastTouchEndRef.current < 500) {
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickY = e.clientY - rect.top;
                    const fraction = Math.max(0, Math.min(3, Math.floor(clickY / (ROW_HEIGHT_PX / 4))));
                    const minutes = fraction * 15;
                    onGridClick(hour, minutes, dateStr);
                  }}
                  onContextMenu={(e) => {
                    // Prevent context menu on long press
                    if (Date.now() - lastTouchEndRef.current < 1000) {
                       e.preventDefault();
                    }
                  }}
                  onTouchStart={(e) => {
                    hasMoved = false;
                    const touch = e.touches[0];
                    startY = touch.clientY;
                    const target = e.currentTarget;
                    
                    touchTimeout = setTimeout(() => {
                      if (!hasMoved) {
                        const rect = target.getBoundingClientRect();
                        const clickY = startY - rect.top;
                        const fraction = Math.max(0, Math.min(3, Math.floor(clickY / (ROW_HEIGHT_PX / 4))));
                        const minutes = fraction * 15;
                        onGridClick(hour, minutes, dateStr);
                        // Vibrate if supported
                        if (navigator.vibrate) navigator.vibrate(50);
                      }
                    }, 450);
                  }}
                  onTouchMove={(e) => {
                    if (Math.abs(e.touches[0].clientY - startY) > 8) {
                      hasMoved = true;
                      if (touchTimeout) clearTimeout(touchTimeout);
                    }
                  }}
                  onTouchEnd={() => {
                    lastTouchEndRef.current = Date.now();
                    if (touchTimeout) clearTimeout(touchTimeout);
                  }}
                  className="border-t border-gray-100 dark:border-white/5 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors w-full select-none"
                  style={{ height: hour === 24 ? "0px" : `${ROW_HEIGHT_PX}px` }}
                ></div>
              );
            })}
          </div>

          <div className="absolute top-4 left-0 right-0 bottom-0 pointer-events-none w-full pr-4 pb-4 overflow-visible mix-blend-normal pl-1.5">
            <div className="relative h-full pointer-events-none w-full">
              {timedTasks.map((task: any, idx: number) => (
                <TaskCard
                  key={task.id ? `${task.id}-${idx}` : `timed-${idx}`}
                  task={task}
                  onToggleStatus={onToggleStatus}
                  isSearchMatch={isMatch(task)}
                  onClick={() => onTaskClick?.(task)}
                  onDoubleClick={() => onTaskClick?.(task, true)}
                  onDeleteTask={onDeleteTask}
                  onUpdateTask={onUpdateTask}
                  layout={layouts[task.id]}
                />
              ))}

              {draftTask && draftTask.date === dateStr && (
                <DraftTaskCard
                  draftTask={draftTask}
                  onStartResize={onStartResize}
                  currentTheme={theme}
                />
              )}
              
              {dragPreview && (
                <>
                  <div 
                    className="absolute -left-[45px] text-[13px] font-bold text-[#1a73e8] dark:text-blue-400 z-50 pointer-events-none transition-all duration-75 ease-in-out bg-white dark:bg-stone-900 px-1 rounded shadow-sm"
                    style={{ top: `${dragPreview.top}px`, marginTop: '-2px' }}
                  >
                    {dragPreview.minuteLabel}
                  </div>
                  <div className="pointer-events-none z-40 transition-all duration-75 ease-in-out drop-preview-card" style={{ opacity: 0.9 }}>
                    <TaskCard task={dragPreview.task} onToggleStatus={() => {}} layout={layouts[dragPreview.task.id]} pointerEventsNone={true} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {isTodayDate && currentIndicatorTop >= 0 && (
          <div 
            className="absolute left-0 right-0 flex items-center pointer-events-none z-20 w-full"
            style={{ top: `${currentIndicatorTop + 16}px`, transform: 'translateY(-50%)' }}
          >
            <div className="w-20 pr-1.5 flex justify-end shrink-0">
              <span className="bg-[#FF3B30] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md tabular-nums select-none min-w-[38px] text-center">
                {format(currentTime || new Date(), "h:mm")}
              </span>
            </div>
            <div className="flex-1 h-[2px] bg-[#FF3B30] relative">
               <div className="absolute top-1/2 -left-1 w-2 h-2 rounded-full bg-[#FF3B30] -translate-y-1/2 shadow-sm" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WeekView({ baseDate, tasks, hours, onGridClick, onToggleStatus, currentIndicatorTop, currentTime, setSelectedDate, searchQuery = "", onTaskClick, onDeleteTask, onUpdateTask, draftTask, onStartResize, theme }: any) {
  const [dragPreview, setDragPreview] = useState<{ task: any, minuteLabel: string, top: number, colDate: string } | null>(null);
  const lastTouchEndRef = React.useRef(0);
  const startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = Array.from({length: 7}).map((_, i) => addDays(startDate, i));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const isMatch = (t: any) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div className="flex flex-col min-h-max min-w-max pb-8 relative w-full">
      <div className="sticky top-0 bg-white dark:bg-stone-900 border-b border-gray-100 dark:border-white/10 z-30 shadow-sm w-full flex flex-col shrink-0">
        <div className="grid grid-cols-[80px_repeat(7,minmax(120px,1fr))] w-full">
          <div className="border-r border-gray-100 dark:border-white/10 shrink-0 bg-white dark:bg-stone-900 flex items-center justify-center">
            <span className="text-[11px] font-bold text-gray-400">W{format(baseDate, 'w')}</span>
          </div>
          {weekDays.map((day, idx) => {
            const isToday = format(day, 'yyyy-MM-dd') === todayStr;
            return (
              <div key={`week-hdr-${format(day, 'yyyy-MM-dd')}-${idx}`} className="text-center py-2.5 border-r border-gray-100 dark:border-white/5 last:border-r-0">
                <div className="flex items-baseline justify-center gap-1.5 leading-none">
                  <span className={cn("text-[12px] font-medium text-gray-400", isToday && "text-google-blue dark:text-blue-400")}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={cn("text-[16px] font-bold", isToday ? "text-google-blue dark:text-blue-400" : "text-gray-900 dark:text-gray-100")}>
                    {format(day, 'd')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-[80px_repeat(7,minmax(120px,1fr))] border-t border-gray-100 dark:border-white/10 w-full min-h-[40px]">
           <div className="border-r border-gray-100 dark:border-white/10 flex items-center justify-center shrink-0">
             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0 px-2 text-center leading-tight">All-Day</span>
           </div>
           {weekDays.map((day, idx) => {
             const dateStr = format(day, 'yyyy-MM-dd');
             const allDayTasks = tasks.filter((t: any) => t.date === dateStr && t.isAllDay);
             return (
                <div 
                  key={`week-allday-${dateStr}-${idx}`} 
                  className="p-1 border-r border-google-grid/50 dark:border-white/5 last:border-r-0 max-h-24 overflow-y-auto custom-scrollbar flex flex-col gap-1"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    let task = (window as any).draggedTaskData;
                    if (!task) {
                      const taskStr = e.dataTransfer.getData("application/json");
                      if (taskStr) {
                        try {
                          task = JSON.parse(taskStr);
                        } catch (_) {}
                      }
                    }
                    if (!task) return;
                    if (onUpdateTask) {
                      onUpdateTask({ ...task, date: dateStr, isAllDay: true });
                    }
                  }}
                >
                   {allDayTasks.map((t: any, tIdx: number) => <AllDayItem key={t.id ? `${t.id}-${tIdx}` : `week-allday-${tIdx}`} task={t} onToggleStatus={onToggleStatus} isSearchMatch={isMatch(t)} onTaskClick={onTaskClick} onDeleteTask={onDeleteTask} />)}
                </div>
             )
           })}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[80px_repeat(7,minmax(120px,1fr))] relative w-full pt-4">
        <div className="border-r border-gray-100 dark:border-white/10 flex flex-col select-none flex-shrink-0 relative z-10 w-[80px]">
          {hours.map((hour: number) => {
            return (
              <div
                key={hour}
                className="flex items-start justify-end pr-3"
                style={{ height: hour === 24 ? "0px" : `${ROW_HEIGHT_PX}px` }}
              >
                <div className="-mt-2.5">{renderHourLabel(hour)}</div>
              </div>
            );
          })}
        </div>

        {weekDays.some(day => format(day, 'yyyy-MM-dd') === todayStr) && currentIndicatorTop >= 0 && (
          <div 
            className="absolute left-0 right-0 flex items-center pointer-events-none z-[40]"
            style={{ top: `${currentIndicatorTop + 16}px`, transform: 'translateY(-50%)' }}
          >
            <div className="w-[80px] pr-1 flex justify-end shrink-0">
              <span className="bg-[#FF3B30] text-white text-[12px] font-black px-2.5 py-0.5 rounded-full tabular-nums select-none min-w-[42px] text-center shadow-sm">
                {format(currentTime || new Date(), "h:mm")}
              </span>
            </div>
            <div className="flex-1 h-[2px] bg-[#FF3B30] relative">
               <div className="absolute top-1/2 -left-1 w-2 h-2 rounded-full bg-[#FF3B30] -translate-y-1/2 shadow-sm" />
            </div>
          </div>
        )}

        <div className="col-span-7 flex relative w-full">
          <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-0">
            {hours.map((hour: number) => (
               <div key={`hline-${hour}`} className="border-t border-gray-100 dark:border-white/5" style={{ height: hour === 24 ? "0px" : `${ROW_HEIGHT_PX}px` }}></div>
            ))}
          </div>

          <div className="grid grid-cols-7 absolute inset-0 text-transparent">
             {weekDays.map((day, i) => {
               const dateStr = format(day, 'yyyy-MM-dd');
               return (
                <div key={`hline-cols-${dateStr}-${i}`} className="border-r border-google-grid/30 dark:border-white/5" />
               )
             })}
          </div>

          <div className="absolute inset-0 flex relative w-full">
          {weekDays.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayTasks = tasks.filter((t: any) => t.date === dateStr && !t.isAllDay);
            const isTodayDate = format(new Date(), 'yyyy-MM-dd') === dateStr;
            const layouts = getTaskLayouts(dayTasks);

            return (
              <div 
                key={`weekday-col-${dateStr}-${i}`} 
                data-date={dateStr}
                data-column="day"
                className="flex-1 min-w-[120px] relative border-r border-transparent dark:border-transparent last:border-r-0 z-10 w-full overflow-visible"
                onDragOver={e => {
                   e.preventDefault();
                   const task = (window as any).draggedTaskData;
                   if (!task) return;
                   
                   const rect = e.currentTarget.getBoundingClientRect();
                   const y = e.clientY - rect.top;
                   
                   const fraction = Math.floor(y / (ROW_HEIGHT_PX / 4));
                   let newStartHour = START_HOUR + Math.floor(fraction / 4);
                   let newStartMinute = (fraction % 4) * 15;
                   
                   newStartHour = Math.max(START_HOUR, Math.min(newStartHour, END_HOUR));
                   if (newStartHour === END_HOUR) newStartMinute = 0;
                   
                   const oldStartParts = task.startTime ? task.startTime.split(':').map(Number) : [12, 0];
                   const oldEndParts = task.endTime ? task.endTime.split(':').map(Number) : [13, 0];
                   const durationParams = (oldEndParts[0] * 60 + oldEndParts[1]) - (oldStartParts[0] * 60 + oldStartParts[1]);
                   const duration = durationParams > 0 ? durationParams : 60;
                   
                   let totalNewEndMins = (newStartHour * 60) + newStartMinute + duration;
                   let newEndHour = Math.floor(totalNewEndMins / 60);
                   let newEndMin = totalNewEndMins % 60;
                   
                   if (newEndHour > END_HOUR + 1 || (newEndHour === END_HOUR + 1 && newEndMin > 0)) {
                      newEndHour = END_HOUR + 1;
                      newEndMin = 0;
                   }
                   
                   const newStartStr = `${newStartHour.toString().padStart(2, '0')}:${newStartMinute.toString().padStart(2, '0')}`;
                   const newEndStr = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;
                   
                   const newTop = (newStartHour - START_HOUR + newStartMinute / 60) * ROW_HEIGHT_PX;
                   setDragPreview(prev => {
                     if (prev && prev.top === newTop && prev.colDate === dateStr) return prev;
                     return {
                       task: { ...task, date: dateStr, startTime: newStartStr, endTime: newEndStr, isAllDay: false },
                       minuteLabel: `:${newStartMinute.toString().padStart(2, '0')}`,
                       top: newTop,
                       colDate: dateStr
                     };
                   });
                }}
                onDragLeave={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const outOfBounds = 
                    e.clientX !== 0 && e.clientY !== 0 && (
                      e.clientX < rect.left ||
                      e.clientX >= rect.right ||
                      e.clientY < rect.top ||
                      e.clientY >= rect.bottom
                    );
                  if (outOfBounds || (!e.relatedTarget && e.clientX === 0)) {
                    setDragPreview(null);
                  } else if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragPreview(null);
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragPreview(null);
                  let task = (window as any).draggedTaskData;
                  if (!task) {
                    const taskStr = e.dataTransfer.getData("application/json");
                    if (taskStr) {
                      try {
                        task = JSON.parse(taskStr);
                      } catch (_) {}
                    }
                  }
                  if (!task) return;
                  
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  
                  const fraction = Math.floor(y / (ROW_HEIGHT_PX / 4));
                  let newStartHour = START_HOUR + Math.floor(fraction / 4);
                  let newStartMinute = (fraction % 4) * 15;
                  
                  newStartHour = Math.max(START_HOUR, Math.min(newStartHour, END_HOUR));
                  if (newStartHour === END_HOUR) newStartMinute = 0;
                  
                  const oldStartParts = task.startTime ? task.startTime.split(':').map(Number) : [12, 0];
                  const oldEndParts = task.endTime ? task.endTime.split(':').map(Number) : [13, 0];
                  const durationParams = (oldEndParts[0] * 60 + oldEndParts[1]) - (oldStartParts[0] * 60 + oldStartParts[1]);
                  const duration = durationParams > 0 ? durationParams : 60;
                  
                  let totalNewEndMins = (newStartHour * 60) + newStartMinute + duration;
                  let newEndHour = Math.floor(totalNewEndMins / 60);
                  let newEndMin = totalNewEndMins % 60;
                  
                  if (newEndHour > END_HOUR + 1 || (newEndHour === END_HOUR + 1 && newEndMin > 0)) {
                     newEndHour = END_HOUR + 1;
                     newEndMin = 0;
                  }
                  
                  const newStartStr = `${newStartHour.toString().padStart(2, '0')}:${newStartMinute.toString().padStart(2, '0')}`;
                  const newEndStr = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;
                  
                  if (onUpdateTask) {
                    onUpdateTask({ ...task, date: dateStr, startTime: newStartStr, endTime: newEndStr, isAllDay: false });
                  }
                }}
              >
                <div className="absolute inset-0">
                   {hours.map((hour: number) => {
                     let touchTimeout: any = null;
                     let hasMoved = false;
                     let startY = 0;

                     return (
                       <div
                         key={`grid-${day.toISOString()}-${hour}`}
                         onClick={(e) => {
                           // Ignore clicks that originate from touch events
                           if (Date.now() - lastTouchEndRef.current < 500) {
                             return;
                           }
                           const rect = e.currentTarget.getBoundingClientRect();
                           const clickY = e.clientY - rect.top;
                           const fraction = Math.max(0, Math.min(3, Math.floor(clickY / (ROW_HEIGHT_PX / 4))));
                           const minutes = fraction * 15;
                           onGridClick(hour, minutes, dateStr);
                         }}
                         onContextMenu={(e) => {
                           // Prevent context menu on long press
                           if (Date.now() - lastTouchEndRef.current < 1000) {
                              e.preventDefault();
                           }
                         }}
                         onTouchStart={(e) => {
                           hasMoved = false;
                           const touch = e.touches[0];
                           startY = touch.clientY;
                           const target = e.currentTarget;
                           
                           touchTimeout = setTimeout(() => {
                             if (!hasMoved) {
                               const rect = target.getBoundingClientRect();
                               const clickY = startY - rect.top;
                               const fraction = Math.max(0, Math.min(3, Math.floor(clickY / (ROW_HEIGHT_PX / 4))));
                               const minutes = fraction * 15;
                               onGridClick(hour, minutes, dateStr);
                               // Vibrate if supported
                               if (navigator.vibrate) navigator.vibrate(50);
                             }
                           }, 450);
                         }}
                         onTouchMove={(e) => {
                           if (Math.abs(e.touches[0].clientY - startY) > 8) {
                             hasMoved = true;
                             if (touchTimeout) clearTimeout(touchTimeout);
                           }
                         }}
                         onTouchEnd={() => {
                           lastTouchEndRef.current = Date.now();
                           if (touchTimeout) clearTimeout(touchTimeout);
                         }}
                         className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors select-none"
                         style={{ height: hour === 24 ? "0px" : `${ROW_HEIGHT_PX}px` }}
                       ></div>
                     );
                   })}
                </div>
                
                {/* Time Indicator removed here to use global one above */}
                
                <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none w-full mix-blend-normal">
                  <div className="relative h-full pointer-events-none">
                    {dayTasks.map((task: any, idx: number) => (
                      <TaskCard
                        key={task.id ? `${task.id}-${idx}` : `week-task-${idx}`}
                        task={task}
                        onToggleStatus={onToggleStatus}
                        isSearchMatch={isMatch(task)}
                        onClick={() => onTaskClick?.(task)}
                        onDoubleClick={() => onTaskClick?.(task, true)}
                        onDeleteTask={onDeleteTask}
                        onUpdateTask={onUpdateTask}
                        layout={layouts[task.id]}
                        mode="week"
                      />
                    ))}

                    {draftTask && draftTask.date === dateStr && (
                      <DraftTaskCard
                        draftTask={draftTask}
                        onStartResize={onStartResize}
                        currentTheme={theme}
                      />
                    )}
                    
                    {dragPreview && dragPreview.colDate === dateStr && (
                      <>
                        <div 
                          className="absolute -left-[45px] text-[13px] font-bold text-[#1a73e8] dark:text-blue-400 z-50 pointer-events-none transition-all duration-75 ease-in-out bg-white dark:bg-stone-900 px-1 rounded shadow-sm"
                          style={{ top: `${dragPreview.top}px`, marginTop: '-2px' }}
                        >
                          {dragPreview.minuteLabel}
                        </div>
                        <div className="pointer-events-none z-40 transition-all duration-75 ease-in-out drop-preview-card" style={{ opacity: 0.9 }}>
                          <TaskCard task={dragPreview.task} onToggleStatus={() => {}} layout={layouts[dragPreview.task.id]} mode="week" pointerEventsNone={true} />
                        </div>
                      </>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthView({ baseDate, tasks, onViewChange, setSelectedDate, onToggleStatus, searchQuery = "", onTaskClick, onDeleteTask, onUpdateTask }: any) {
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [dragPos, setDragPos] = React.useState({ x: 0, y: 0 });
  const [dragWidth, setDragWidth] = React.useState(0);

  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const isMatch = (t: any) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-stone-900 border-t border-google-grid dark:border-white/5">
      <div className="grid grid-cols-7 bg-white dark:bg-stone-900 border-b border-google-grid dark:border-white/10 flex-shrink-0">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest border-r border-google-grid dark:border-white/5 last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div 
        className={cn(
          "grid grid-cols-7 flex-1 auto-rows-fr",
          draggedTaskId ? "overflow-visible" : "overflow-hidden"
        )}
        onTouchMove={(e) => {
          if (!draggedTaskId) return;
          if (e.cancelable) e.preventDefault();
          setDragPos({
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
          });
        }}
        onTouchEnd={(e) => {
          if (!draggedTaskId) return;
          const x = e.changedTouches[0].clientX;
          const y = e.changedTouches[0].clientY;
          const targetCell = (document as any).elementsFromPoint?.(x, y)
            .find((el: any) => el.dataset?.column === 'month-day');

          if (targetCell) {
            const newDate = targetCell.dataset.date;
            const taskToUpdate = tasks.find((t: any) => t.id === draggedTaskId);
            if (taskToUpdate && newDate !== taskToUpdate.date) {
              onUpdateTask({ ...taskToUpdate, date: newDate });
            }
          }
          setDraggedTaskId(null);
        }}
      >
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = dateStr === todayStr;
          const isCurrentMonth = isSameMonth(day, baseDate);
          const dayTasks = tasks.filter((t:any) => t.date === dateStr);

          // Find matches for indicator purposes
          const hasMatches = dayTasks.some((t: any) => isMatch(t));

          return (
            <div 
              key={`month-cell-${dateStr}-${i}`}
              data-date={dateStr}
              data-column="month-day"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                let task = (window as any).draggedTaskData;
                if (!task) {
                  const taskStr = e.dataTransfer.getData("application/json");
                  if (taskStr) {
                    try {
                      task = JSON.parse(taskStr);
                    } catch (_) {}
                  }
                }
                if (!task) return;
                if (onUpdateTask) {
                  onUpdateTask({ ...task, date: dateStr });
                }
              }}
              onClick={() => {
                setSelectedDate?.(dateStr);
                onViewChange('day');
              }}
              className={cn(
                "border-b border-r border-google-grid dark:border-white/5 p-1.5 flex flex-col gap-1 min-h-[100px] cursor-pointer hover:bg-gray-100/50 dark:hover:bg-white/5 transition-colors relative",
                !isCurrentMonth && "bg-gray-50/50 dark:bg-stone-900/50 opacity-50",
                isToday && "bg-google-blue/10 dark:bg-google-blue/5",
                searchQuery && dayTasks.length > 0 && !hasMatches && "bg-gray-100 opacity-60 dark:bg-stone-900",
                draggedTaskId && "overflow-visible z-50"
              )}
            >
              <div className="flex justify-between items-center mb-1 ml-1 mt-0.5">
                <span className={cn(
                  "text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full",
                  isToday ? "bg-[#1a73e8] text-white" : "text-gray-700 dark:text-gray-300"
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-[2px]">
                {dayTasks.map((t: any, tIdx: number) => {
                  const allDayColors: any = {
                    blue: "bg-[#1a73e8] text-white hover:bg-blue-600",
                    green: "bg-emerald-600 text-white hover:bg-emerald-700",
                    yellow: "bg-yellow-600 text-white hover:bg-yellow-700",
                    red: "bg-red-600 text-white hover:bg-red-700",
                  };
                  const dotColors: any = {
                    blue: "bg-[#1a73e8]",
                    green: "bg-emerald-500",
                    yellow: "bg-yellow-500",
                    red: "bg-red-500",
                  };
                  const themeColor = t.color || 'blue';
                  const match = isMatch(t);
                  
                  const isDragging = draggedTaskId === t.id;

                   return (
                  <div 
                    key={t.id ? `${t.id}-${tIdx}` : `month-task-${tIdx}`}
                    draggable={!t.isCompleted}
                    onDragStart={(e) => {
                      (window as any).draggedTaskData = t;
                      e.dataTransfer.setData("application/json", JSON.stringify(t));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={(e) => {
                      setTimeout(() => {
                        if ((window as any).draggedTaskData === t) {
                          (window as any).draggedTaskData = null;
                        }
                      }, 300);
                    }}
                    onTouchStart={(e) => {
                      if (t.isCompleted) return;
                      setDraggedTaskId(t.id);
                      setDragPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                      // Capture width to maintain shape while fixed
                      setDragWidth(e.currentTarget.offsetWidth);
                    }}
                    onClick={(e) => { e.stopPropagation(); onTaskClick?.(t); }}
                    style={isDragging ? {
                      position: 'fixed',
                      left: dragPos.x,
                      top: dragPos.y,
                      width: dragWidth,
                      transform: 'translate(-50%, -50%) scale(1.05)',
                      zIndex: 9999,
                      pointerEvents: 'none'
                    } : {}}
                    className={cn(
                      "text-[10px] font-medium px-1 py-0.5 rounded truncate transition-colors flex items-center gap-1.5",
                      !t.isCompleted && "cursor-grab active:cursor-grabbing",
                      t.isAllDay ? allDayColors[themeColor] : "bg-transparent hover:bg-gray-100 dark:hover:bg-white/10 dark:text-gray-100",
                      t.isCompleted && "opacity-50 line-through",
                      !match && "opacity-10 pointer-events-none scale-[0.98] blur-[0.5px]",
                      isDragging && "shadow-[0_8px_20px_rgba(0,0,0,0.15)] bg-white dark:bg-stone-800 opacity-95"
                    )}
                  >
                    {!t.isAllDay && <div className={cn("w-[2.5px] h-3.5 rounded-full shrink-0", dotColors[themeColor])} />}
                    <span className="flex-1 truncate">{t.title}</span>
                    {!t.isAllDay && <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium shrink-0 tabular-nums ml-auto">{format12Hour(t.startTime)}</span>}
                  </div>
                )})}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
}

function AllDayItem({ task, onToggleStatus, isSearchMatch = true, onTaskClick, onDeleteTask }: { key?: string | number, task: any, onToggleStatus: (id: string) => void, isSearchMatch?: boolean, onTaskClick?: (task: any) => void, onDeleteTask?: (id: string) => void }) {
  const colorMap = {
    blue: { bg: "bg-blue-100 border-blue-500", text: "text-blue-900", icon: "bg-blue-500" },
    green: { bg: "bg-emerald-100 border-emerald-500", text: "text-emerald-900", icon: "bg-emerald-500" },
    yellow: { bg: "bg-yellow-100 border-yellow-500", text: "text-yellow-900", icon: "bg-yellow-500" },
    red: { bg: "bg-red-100 border-red-500", text: "text-red-900", icon: "bg-red-500" }
  } as any;
  const theme = colorMap[task.color || "blue"] || colorMap.blue;

  return (
    <div 
      draggable={!task.isCompleted}
      onDragStart={(e) => {
        (window as any).draggedTaskData = task;
        e.dataTransfer.setData("application/json", JSON.stringify(task));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={(e) => {
        setTimeout(() => {
          if ((window as any).draggedTaskData === task) {
            (window as any).draggedTaskData = null;
          }
        }, 300);
      }}
      className={cn(
        "flex items-center gap-2 p-1.5 rounded border-l-4 transition-all hover:shadow-sm group",
        !task.isCompleted ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        theme.bg,
        task.isCompleted && "opacity-50",
        !isSearchMatch && "opacity-10 pointer-events-none scale-[0.98] blur-[0.5px]"
      )}
      onClick={(e) => { e.stopPropagation(); onTaskClick?.(task); }}
    >
      <button 
        className={cn("flex-shrink-0 w-3 h-3 rounded-full border border-black/10 flex items-center justify-center text-white focus:outline-none", task.isCompleted ? theme.icon : "bg-white overflow-hidden")}
        onClick={(e) => { e.stopPropagation(); onToggleStatus(task.id); }}
      >
         {task.isCompleted && <Check className="w-2 h-2" />}
      </button>
      <span className={cn("text-xs font-semibold truncate flex-1", theme.text, task.isCompleted && "line-through opacity-70")}>{task.title}</span>
      
      {onDeleteTask && (
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
          className={cn("opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity text-black/40 hover:text-red-500 focus:outline-none")}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function YearView({ baseDate, tasks, onViewChange, setSelectedDate, searchQuery = "" }: any) {
  const currentYear = baseDate.getFullYear();
  const yearStart = startOfYear(baseDate);
  const yearEnd = endOfYear(baseDate);
  const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const isMatch = (t: any) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div className="flex flex-col h-full bg-white dark:bg-stone-900 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8 max-w-7xl mx-auto w-full">
        {months.map((month, mIdx) => {
          const monthStartDay = startOfMonth(month);
          const monthEndDay = endOfMonth(month);
          const startDate = startOfWeek(monthStartDay, { weekStartsOn: 1 });
          const endDate = endOfWeek(monthEndDay, { weekStartsOn: 1 });
          const days = eachDayOfInterval({ start: startDate, end: endDate });

          return (
            <div 
              key={`year-month-${month.getFullYear()}-${month.getMonth()}-${mIdx}`} 
              className="flex flex-col group cursor-pointer"
              onClick={() => {
                setSelectedDate?.(format(month, 'yyyy-MM-dd'));
                onViewChange('month');
              }}
            >
              <h3 className="text-[13px] font-bold text-google-blue dark:text-blue-400 uppercase tracking-widest pl-1 mb-3 group-hover:underline">
                {format(month, 'MMMM')}
              </h3>
              <div className="grid grid-cols-7 gap-y-1 gap-x-1">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <div key={i} className="text-center text-[9px] font-bold text-gray-400 tracking-wider mb-1">
                    {d}
                  </div>
                ))}
                {days.map((day, dIdx) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isToday = dateStr === todayStr;
                  const isCurrentMonth = isSameMonth(day, month);
                  const dayTasks = tasks.filter((t:any) => t.date === dateStr);
                  const hasTasks = dayTasks.length > 0;
                  const hasMatches = searchQuery && dayTasks.some((t: any) => isMatch(t));

                  return (
                    <div 
                      key={`year-day-${dateStr}-${dIdx}`} 
                      className="aspect-square flex items-center justify-center relative"
                    >
                      <span className={cn(
                        "text-[11px] w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                        isToday ? "bg-google-blue text-white font-bold" : (isCurrentMonth ? "text-gray-700 dark:text-gray-300 font-medium" : "text-gray-300 dark:text-gray-600 font-light"),
                        hasTasks && !isToday && "bg-gray-100 dark:bg-white/10"
                      )}>
                        {format(day, 'd')}
                      </span>
                      {hasTasks && !isToday && (
                        <div className="absolute bottom-0 w-1 h-1 bg-google-blue rounded-full"></div>
                      )}
                      {searchQuery && hasTasks && !hasMatches && (
                        <div className="absolute inset-0 bg-white/60 dark:bg-stone-900/60 rounded-full" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
