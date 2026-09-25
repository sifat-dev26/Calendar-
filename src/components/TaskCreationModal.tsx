import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Bell, Volume2, VolumeX, Check, ChevronRight, Mic, Square, Loader2 } from "lucide-react";
import { Task, TaskReminderLeadTime, NotificationTone } from "../types";
import { cn } from "../lib/utils";
import { NOTIFICATION_TONES, playNotificationSound, unlockAudio } from "../lib/audio";
import { motion, AnimatePresence } from "motion/react";
import { useAudioTranscriber } from "../hooks/useAudioTranscriber";
import { parseNaturalLanguageTask, ParsedNaturalTask } from "../lib/naturalLanguage";

interface TaskCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTask: (task: Omit<Task, "id" | "isCompleted"> & { recurrence?: string }) => void;
  initialDate: string;
  prefillTime?: { start: string; end: string; title?: string } | null;
}

export function TaskCreationModal({
  isOpen,
  onClose,
  onAddTask,
  initialDate,
  prefillTime,
}: TaskCreationModalProps) {
  const isMountingRef = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    isMountingRef.current = true;
    const lockTimer = setTimeout(() => {
      isMountingRef.current = false;
    }, 120);
    return () => {
      clearTimeout(lockTimer);
    };
  }, [isOpen]);

  const safeOnClose = () => {
    if (isMountingRef.current) return;
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        safeOnClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [recurrence, setRecurrence] = useState("none");
  const [isAllDay, setIsAllDay] = useState(false);
  const [color, setColor] = useState<"blue" | "green" | "yellow" | "red">("blue");
  const [error, setError] = useState("");
  const [reminderLeadTime, setReminderLeadTime] = useState<TaskReminderLeadTime>("default");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationTone, setNotificationTone] = useState<NotificationTone>("chime");
  const [isParsingTask, setIsParsingTask] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const parseCacheRef = useRef<{ text: string; result: Promise<ParsedNaturalTask | null> } | null>(null);
  const parseRequestRef = useRef(0);

  const {
    isRecording: isDictating,
    isTranscribing: isTranscribingVoice,
    recordingDuration: recordingSecs,
    startRecording,
    stopRecordingAndTranscribe,
  } = useAudioTranscriber();

  const parseTaskText = (text: string): Promise<ParsedNaturalTask | null> => {
    const normalizedText = text.trim();
    if (!normalizedText) return Promise.resolve(null);
    if (parseCacheRef.current?.text === normalizedText) return parseCacheRef.current.result;

    const requestId = ++parseRequestRef.current;
    const result = (async () => {
      const localResult = parseNaturalLanguageTask(normalizedText, selectedDate);
      if (localResult?.hasDate && localResult.hasTime) {
        setIsParsingTask(false);
        return localResult;
      }
      const hasScheduleCue = /\b(?:today|tomorrow|tonight|morning|afternoon|evening|noon|midnight|next|this|at|on|by|from|until|before|after|between|when|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(normalizedText);
      if (!hasScheduleCue) {
        return localResult || { taskName: normalizedText, hasDate: false, hasTime: false };
      }

      setIsParsingTask(true);
      try {
        const response = await fetch("/api/parse-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: normalizedText, defaultDate: selectedDate }),
        });
        if (!response.ok) return localResult;

        const parsed = await response.json();
        const isValidDate = (value: unknown): value is string => {
          if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const [year, month, day] = value.split("-").map(Number);
          const candidate = new Date(year, month - 1, day);
          return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
        };
        const isValidTime = (value: unknown): value is string =>
          typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
        const hasDate = localResult?.hasDate || (parsed.hasDate === true && isValidDate(parsed.date));
        const hasTime = localResult?.hasTime || (parsed.hasTime === true && isValidTime(parsed.startTime));

        return {
          taskName: localResult?.taskName || parsed.taskName || normalizedText,
          hasDate,
          hasTime,
          ...(localResult?.date ? { date: localResult.date } : hasDate ? { date: parsed.date } : {}),
          ...(localResult?.startTime
            ? { startTime: localResult.startTime, endTime: localResult.endTime }
            : hasTime && isValidTime(parsed.startTime)
              ? { startTime: parsed.startTime, endTime: isValidTime(parsed.endTime) ? parsed.endTime : undefined }
              : {}),
        };
      } catch {
        return localResult;
      } finally {
        if (requestId === parseRequestRef.current) setIsParsingTask(false);
      }
    })();

    parseCacheRef.current = { text: normalizedText, result };
    return result;
  };

  const applyParsedValues = (parsed: ParsedNaturalTask) => {
    setTitle(parsed.taskName);
    if (parsed.hasDate && parsed.date) setSelectedDate(parsed.date);
    if (parsed.hasTime && parsed.startTime) {
      setStartTime(parsed.startTime);
      setEndTime(parsed.endTime || parsed.startTime);
    }
    setError("");
    parseCacheRef.current = { text: parsed.taskName, result: Promise.resolve(parsed) };
  };

  const applyTypedTask = async (text: string) => {
    const parsed = await parseTaskText(text);
    if (parsed && titleInputRef.current?.value.trim() === text.trim()) {
      applyParsedValues(parsed);
    }
  };

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    if (!newStart) return;

    const [startH, startM] = (startTime || "00:00").split(":").map(Number);
    const [endH, endM] = (endTime || "00:00").split(":").map(Number);
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
      setEndTime(newEndStr);
    }
  };

  useEffect(() => {
    if (isOpen) {
      parseCacheRef.current = null;
      parseRequestRef.current += 1;
      setIsParsingTask(false);
      if (prefillTime) {
        setStartTime(prefillTime.start);
        setEndTime(prefillTime.end);
        setTitle(prefillTime.title || "");
      } else {
        setStartTime("09:00");
        setEndTime("10:00");
        setTitle("");
      }
      setSelectedDate(initialDate);
      if (titleInputRef.current) {
        setTimeout(() => titleInputRef.current?.focus(), 50);
      }
    } else {
      setTitle("");
      setDescription("");
      setIsAllDay(false);
      setRecurrence("none");
      setColor("blue");
      setError("");
      setReminderLeadTime("default");
      setSoundEnabled(true);
      setNotificationTone("chime");
    }
  }, [isOpen, prefillTime, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredTitle = title.trim();
    if (!enteredTitle) {
      setError("Please enter a task name.");
      return;
    }

    const parsedTask = await parseTaskText(enteredTitle);
    const taskTitle = parsedTask?.taskName.trim() || enteredTitle;
    const taskDate = parsedTask?.hasDate && parsedTask.date ? parsedTask.date : selectedDate;
    const taskStartTime = parsedTask?.hasTime && parsedTask.startTime ? parsedTask.startTime : startTime;
    const taskEndTime = parsedTask?.hasTime && parsedTask.endTime ? parsedTask.endTime : endTime;

    if (!isAllDay) {
      const timeToMins = (time: string) => {
        const [h, m] = (time || "00:00").split(":").map(Number);
        return h * 60 + m;
      };
      
      const startMins = timeToMins(taskStartTime);
      const endMins = timeToMins(taskEndTime);

      if (endMins <= startMins) {
        setError("End time must be after start time.");
        return;
      }
    }

    setError("");
    onAddTask({
      title: taskTitle,
      description: description.trim(),
      date: taskDate,
      startTime: isAllDay ? "00:00" : taskStartTime,
      endTime: isAllDay ? "23:59" : taskEndTime,
      recurrence,
      color,
      isAllDay,
      reminderLeadTime,
      soundEnabled,
      notificationTone,
    });

    onClose();
  };

  if (!isOpen) return null;

  const leadTimeOptions: { value: TaskReminderLeadTime; label: string }[] = [
    { value: "default", label: "Use global setting" },
    { value: "none", label: "No reminder" },
    { value: "now", label: "At start time" },
    { value: "5m", label: "5 minutes before" },
    { value: "10m", label: "10 minutes before" },
    { value: "15m", label: "15 minutes before" },
    { value: "30m", label: "30 minutes before" },
  ];

  return createPortal(
    <div 
      id="task-creation-overlay"
      className="fixed inset-0 flex items-end sm:items-center justify-center z-[200] p-0 sm:p-4" 
      style={{ backgroundColor: 'rgba(23, 23, 23, 0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget || (e.target instanceof HTMLElement && e.target.id === 'task-creation-overlay')) {
          safeOnClose();
        }
      }}
    >
      <motion.div 
        ref={dialogRef}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        id="task-creation-dialog"
        className="bg-white dark:bg-[#1C1C1E] rounded-t-2xl sm:rounded-2xl border border-gray-200/70 dark:border-white/10 shadow-2xl w-full sm:max-w-lg overflow-hidden relative flex flex-col max-h-[94vh] sm:max-h-[min(850px,94vh)] mx-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="text-sm font-semibold text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">
            New task
          </h2>
          <button 
            type="submit"
            form="task-creation-form"
            className="px-3.5 py-2 text-sm font-semibold text-white bg-google-blue hover:bg-blue-600 rounded-lg transition-colors"
          >
            Add task
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form 
            id="task-creation-form"
            onSubmit={handleSubmit} 
            className="px-6 py-6 flex flex-col gap-7"
          >
            {/* Group 1: Details - Frameless & Borderless with Voice Dictation */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  id="modalTaskTitle"
                  ref={titleInputRef}
                  type="text"
                  placeholder="Title or speak details..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    if (title.trim()) void applyTypedTask(title);
                  }}
                  className="flex-1 bg-transparent text-[22px] font-semibold focus:outline-none text-black dark:text-white placeholder:text-[#E2E2E2] dark:placeholder:text-[#3A3A3C]"
                  required
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (isDictating) {
                      const transcript = await stopRecordingAndTranscribe();
                      if (transcript && transcript.trim()) {
                        const parsed = await parseTaskText(transcript.trim());
                        if (parsed) applyParsedValues(parsed);
                        else setTitle(transcript.trim());
                      }
                    } else {
                      await startRecording();
                    }
                  }}
                  title={isDictating ? "Stop recording and transcribe" : "Dictate event with voice (gemini-3.5-transcribe)"}
                  className={cn(
                    "p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                    isDictating 
                      ? "bg-rose-500 text-white animate-pulse" 
                      : "text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-white/10"
                  )}
                >
                  {isTranscribingVoice ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  ) : isDictating ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      <span className="text-xs font-bold">{recordingSecs}s</span>
                    </>
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              </div>

              {isParsingTask && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-google-blue">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Reading date and time...</span>
                </div>
              )}

              {isDictating && (
                <div className="text-xs text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1 animate-pulse">
                  <span>Listening with microphone... Click mic or Stop when done</span>
                </div>
              )}
              {isTranscribingVoice && (
                <div className="text-xs text-indigo-500 dark:text-indigo-400 font-medium flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Transcribing speech using gemini-3.5-transcribe...</span>
                </div>
              )}

              <input
                id="modalTaskLocation"
                type="text"
                placeholder="Add location or video link"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-transparent text-[14px] text-[#8E8E93] focus:outline-none placeholder:text-[#E2E2E2] dark:placeholder:text-[#3A3A3C]"
              />
            </div>

            {/* Group 2: Timing - Minimalist Inline */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 text-[14px]">
                <div className="flex items-center gap-4 text-black dark:text-white">
                  <span className="font-medium w-12 shrink-0">Starts</span>
                  <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors cursor-pointer">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent focus:outline-none cursor-pointer w-[110px]"
                    />
                    {!isAllDay && (
                      <input
                        type="time"
                        value={startTime}
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
                      value={selectedDate}
                      className="bg-transparent focus:outline-none cursor-pointer w-[110px]"
                      readOnly
                    />
                    {!isAllDay && (
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
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
                      onClick={() => setIsAllDay(!isAllDay)}
                      className={cn(
                        "relative w-7 h-4 rounded-full transition-colors duration-200 focus:outline-none shrink-0",
                        isAllDay ? "bg-[#34C759]" : "bg-[#E9E9EB] dark:bg-[#39393D]"
                      )}
                    >
                      <motion.div 
                        animate={{ x: isAllDay ? 12 : 2 }}
                        className="absolute top-[2px] w-3 h-3 rounded-full bg-white shadow-sm"
                      />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 group cursor-pointer">
                    <span className="text-[#8E8E93]">Repeat</span>
                    <div className="flex items-center gap-0.5">
                      <select
                        id="modalRecurrence"
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value)}
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
                      value={reminderLeadTime}
                      onChange={(e) => setReminderLeadTime(e.target.value as any)}
                      className="appearance-none bg-transparent text-black dark:text-white focus:outline-none cursor-pointer pr-1 font-medium"
                    >
                      {leadTimeOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronRight className="w-3.5 h-3.5 text-[#C4C4C6]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Group 3: Categories - Horizontal Pills */}
            <div className="flex flex-col gap-3 mt-8">
              <span className="text-[12px] font-medium text-[#8E8E93] uppercase tracking-wider">Category</span>
              <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'blue', name: 'Work', color: '#007AFF', bg: 'bg-[#007AFF]/10', darkBg: 'dark:bg-[#007AFF]/20' },
                    { id: 'green', name: 'Health', color: '#34C759', bg: 'bg-[#34C759]/10', darkBg: 'dark:bg-[#34C759]/20' },
                    { id: 'yellow', name: 'Personal', color: '#FFCC00', bg: 'bg-[#FFCC00]/10', darkBg: 'dark:bg-[#FFCC00]/20' },
                    { id: 'red', name: 'Urgent', color: '#FF3B30', bg: 'bg-[#FF3B30]/10', darkBg: 'dark:bg-[#FF3B30]/20' }
                  ] as const).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setColor(cat.id)}
                      className={cn(
                        "px-4 py-1.5 rounded-full flex items-center gap-2 border transition-all text-[13px] font-medium",
                        color === cat.id 
                          ? `${cat.bg} ${cat.darkBg} border-transparent text-black dark:text-white`
                          : "bg-transparent border-gray-100 dark:border-[#38383A] text-[#8E8E93] hover:border-gray-200 dark:hover:border-gray-700"
                      )}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </button>
                  ))}
              </div>
            </div>

            {error && (
              <p className="text-[13px] text-[#FF3B30] px-4 font-medium">
                {error}
              </p>
            )}
          </form>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
