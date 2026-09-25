import React, { useState, useRef, useEffect } from "react";
import { 
  X, 
  Bot, 
  Sparkles, 
  Send, 
  Mic, 
  Square, 
  Trash2, 
  Loader2, 
  User, 
  Calendar, 
  Clock, 
  Check, 
  Copy, 
  RotateCcw,
  AlertCircle
} from "lucide-react";
import { Task } from "../types";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useAudioTranscriber } from "../hooks/useAudioTranscriber";

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionSummary?: {
    scheduled?: number;
    deleted?: number;
    rescheduled?: number;
  };
}

interface SidebarProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id' | 'isCompleted'> & { recurrence?: string }) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTask: (task: Task) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onClose: () => void;
}

const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  text: "Hello! I'm Chronos Assistant powered by  Flash. I can plan your timetable, add, delete, or reschedule events in bulk, answer questions, or transcribe your voice instructions. How can I help today?",
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};

const SUGGESTED_PROMPTS = [
  "🗓️ What events do I have scheduled today?",
  "⚡ Plan deep work from 9:00 AM to 11:00 AM",
  "⏰ Push afternoon tasks by 1 hour",
  "🧹 Clear all completed events"
];

export function Sidebar({
  tasks,
  onAddTask,
  onDeleteTask,
  onUpdateTask,
  selectedDate,
  setSelectedDate,
  onClose,
}: SidebarProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("chronos_chat_history_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const seen = new Set<string>();
          return parsed.map((m: any, idx: number) => {
            let id = m.id;
            if (!id || seen.has(id)) {
              id = `${m.role || 'msg'}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
            }
            seen.add(id);
            return { ...m, id };
          });
        }
      }
    } catch {
      // fallback
    }
    return [DEFAULT_WELCOME_MESSAGE];
  });
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    isRecording,
    isTranscribing,
    recordingDuration,
    error: audioError,
    clearError: clearAudioError,
    startRecording,
    stopRecordingAndTranscribe,
    cancelRecording,
  } = useAudioTranscriber();

  // Save conversation history to local storage
  useEffect(() => {
    try {
      localStorage.setItem("chronos_chat_history_v2", JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to persist chat history:", e);
    }
  }, [messages]);

  // Auto-scroll on new message or typing
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, isTyping, isRecording, isTranscribing]);

  const handleClearChat = () => {
    const fresh: ChatMessage[] = [{
      ...DEFAULT_WELCOME_MESSAGE,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }];
    setMessages(fresh);
    try {
      localStorage.setItem("chronos_chat_history_v2", JSON.stringify(fresh));
    } catch {
      // ignored
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const promptText = (textToSend || input).trim();
    if (!promptText || isTyping) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      text: promptText,
      timestamp: timeStr
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsTyping(true);

    try {
      // Send entire conversation history for true multi-turn context
      const payloadMessages = newMessages.map(m => ({
        role: m.role,
        text: m.text
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: payloadMessages,
          defaultDate: selectedDate,
          tasks 
        })
      });

      if (!res.ok) {
        let errMsg = "Assistant connection interrupted.";
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }
      
      const data = await res.json();
      
      let scheduledCount = 0;
      let deletedCount = 0;
      let rescheduledCount = 0;

      // 1. Process automated bulk event creations
      if (data.events && Array.isArray(data.events) && data.events.length > 0) {
        data.events.forEach((evt: any) => {
          onAddTask({
            title: evt.title || "Untitled Task",
            date: evt.date || selectedDate,
            startTime: evt.startTime || "09:00",
            endTime: evt.endTime || "10:00",
            color: 'blue'
          });
        });
        scheduledCount = data.events.length;
      }

      // 2. Process automated bulk deletions
      if (data.deleteEvents && Array.isArray(data.deleteEvents) && data.deleteEvents.length > 0) {
        data.deleteEvents.forEach((id: string) => {
          onDeleteTask(id);
        });
        deletedCount = data.deleteEvents.length;
      }

      // 3. Process automated bulk rescheduling
      if (data.modifyEvents && Array.isArray(data.modifyEvents) && data.modifyEvents.length > 0) {
        data.modifyEvents.forEach((update: any) => {
          const match = tasks.find(t => t.id === update.id);
          if (match) {
            onUpdateTask({
              ...match,
              date: update.newDate || match.date,
              startTime: update.newStartTime || match.startTime,
              endTime: update.newEndTime || match.endTime
            });
            rescheduledCount++;
          }
        });
      }

      const hasActions = scheduledCount > 0 || deletedCount > 0 || rescheduledCount > 0;

      const assistantMessage: ChatMessage = {
        id: `asst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: 'assistant',
        text: data.text || "I've reviewed your request and made the updates to your schedule.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionSummary: hasActions ? {
          scheduled: scheduledCount,
          deleted: deletedCount,
          rescheduled: rescheduledCount
        } : undefined
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err: any) {
      setMessages(prev => [
        ...prev, 
        { 
          id: `err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant', 
          text: `⚠️ ${err.message || "I encountered an error communicating with Gemini. Please try again."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleStartVoice = async () => {
    clearAudioError();
    await startRecording();
  };

  const handleStopAndTranscribe = async () => {
    const transcript = await stopRecordingAndTranscribe();
    if (transcript && transcript.trim()) {
      // Put transcribed text in input and automatically submit
      setInput(transcript.trim());
      handleSendMessage(transcript.trim());
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white dark:bg-[#18181b] border-l border-gray-200 dark:border-white/10 shadow-2xl z-[150] flex flex-col font-sans select-text"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-150 dark:border-white/10 flex items-center justify-between bg-white/95 dark:bg-[#18181b]/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-blue-500/25">
            <Bot className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                Chronos Assistant
              </h2>
              
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Multi-turn & Voice enabled
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={handleClearChat}
            title="Reset conversation"
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all text-gray-400 hover:text-gray-900 dark:hover:text-white cursor-pointer active:scale-95"
            title="Close Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Thread */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 custom-scrollbar bg-gray-50/50 dark:bg-[#121214]"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div 
              key={msg.id ? `${msg.id}-${idx}` : `msg-${idx}`} 
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cn(
                "flex flex-col gap-1.5 max-w-[88%] group",
                msg.role === 'user' ? "self-end items-end" : "self-start items-start"
              )}
            >
              <div
                className={cn(
                  "p-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm relative",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-xs font-medium" 
                    : "bg-white dark:bg-[#202024] text-gray-800 dark:text-gray-100 rounded-tl-xs border border-gray-200/70 dark:border-white/10 font-normal"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Action summary badge if operations were performed */}
                {msg.actionSummary && (
                  <div className="mt-2.5 pt-2 border-t border-gray-150 dark:border-white/10 flex flex-wrap gap-1.5">
                    {msg.actionSummary.scheduled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40">
                        <Calendar className="w-3 h-3" />
                        Added {msg.actionSummary.scheduled} event(s)
                      </span>
                    ) : null}
                    {msg.actionSummary.rescheduled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40">
                        <Clock className="w-3 h-3" />
                        Adjusted {msg.actionSummary.rescheduled} event(s)
                      </span>
                    ) : null}
                    {msg.actionSummary.deleted ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800/40">
                        <Trash2 className="w-3 h-3" />
                        Removed {msg.actionSummary.deleted} event(s)
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Message metadata / Copy action */}
              <div className="flex items-center gap-2 px-1 text-[10px] text-gray-400 dark:text-gray-500">
                <span>{msg.timestamp}</span>
                {msg.role === 'assistant' && (
                  <button 
                    onClick={() => handleCopyMessage(msg.id, msg.text)}
                    className="opacity-0 group-hover:opacity-100 hover:text-gray-700 dark:hover:text-gray-300 transition-opacity flex items-center gap-0.5 cursor-pointer"
                  >
                    {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId === msg.id ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>
            </motion.div>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-[#202024] text-blue-600 dark:text-blue-400 self-start rounded-2xl rounded-tl-xs p-3.5 flex items-center gap-2 border border-gray-200/70 dark:border-white/10 shadow-sm"
            >
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce [animation-duration:0.6s]"></span>
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce [animation-duration:0.6s] [animation-delay:0.15s]"></span>
                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce [animation-duration:0.6s] [animation-delay:0.3s]"></span>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 font-medium">
                Gemini is thinking...
              </span>
            </motion.div>
          )}

          {/* Transcribing Indicator */}
          {isTranscribing && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/40 rounded-2xl p-3.5 flex items-center gap-2.5 shadow-sm"
            >
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="text-xs font-semibold">
                Transcribing audio with gemini-3.5-transcribe...
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Audio Error Alert if any */}
        {audioError && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-xs p-3 rounded-xl flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{audioError}</span>
            </div>
            <button onClick={clearAudioError} className="text-rose-500 hover:text-rose-800 p-0.5 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Suggestion Starter Chips (shown when few messages) */}
        {messages.length <= 2 && (
          <div className="mt-2 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1">
              Suggested Prompts
            </span>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  className="text-left text-xs bg-white dark:bg-[#202024] hover:bg-gray-100 dark:hover:bg-[#2a2a2e] text-gray-700 dark:text-gray-200 p-2.5 rounded-xl border border-gray-200/70 dark:border-white/5 transition-all shadow-xs hover:border-blue-300 dark:hover:border-blue-500/30 cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active Audio Recording Bar */}
      {isRecording && (
        <div className="bg-red-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900/50 p-3.5 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                Recording audio... {formatTimer(recordingDuration)}
              </span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400">
                Speak naturally (task name, times, or changes)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              className="px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleStopAndTranscribe}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Transcribe</span>
            </button>
          </div>
        </div>
      )}

      {/* Input Controls */}
      <div className="p-4 border-t border-gray-150 dark:border-white/10 bg-white dark:bg-[#18181b] shrink-0">
        <div className="relative flex items-center bg-gray-100 dark:bg-[#202024] rounded-2xl border border-gray-200/80 dark:border-white/10 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-all p-1">
          <textarea 
            ref={textareaRef}
            rows={1}
            placeholder={isRecording ? "Recording in progress..." : "Ask Chronos or plan schedule..."}
            value={input}
            disabled={isRecording || isTranscribing}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="flex-1 bg-transparent px-3 py-2 text-[13.5px] focus:outline-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none max-h-24 font-normal"
          />

          <div className="flex items-center gap-1 pr-1">
            {/* Audio Recording Button using gemini-3.5-transcribe */}
            <button
              type="button"
              onClick={isRecording ? handleStopAndTranscribe : handleStartVoice}
              disabled={isTranscribing}
              title={isRecording ? "Stop and transcribe audio" : "Record voice with microphone"}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer",
                isRecording 
                  ? "bg-rose-600 text-white animate-pulse" 
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
              )}
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send Message Button */}
            <button 
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!input.trim() || isTyping || isRecording || isTranscribing}
              title="Send message"
              className="w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl transition-all shadow-xs disabled:cursor-not-allowed cursor-pointer active:scale-95"
            >
              {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2.5 px-1 text-[11px] text-gray-400 dark:text-gray-500">
          
          <span>Enter to send</span>
        </div>
      </div>
    </motion.div>
  );
}
