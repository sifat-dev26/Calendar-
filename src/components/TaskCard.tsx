import React from 'react';
import { Check, Clock } from 'lucide-react';
import { Task } from '../types';
import { cn, ROW_HEIGHT_PX, START_HOUR, END_HOUR, formatNotificationTime } from '../lib/utils';
import { motion } from 'motion/react';

interface TaskCardProps {
  task: Task;
  onToggleStatus: (id: string) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onDeleteTask?: (id: string) => void;
  onUpdateTask?: (task: Task) => void;
  isSearchMatch?: boolean;
  layout?: {
    top?: number;
    height?: number;
    left?: string;
    width?: string;
    zIndex?: number;
  };
  pointerEventsNone?: boolean;
  mode?: 'day' | 'week';
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onToggleStatus,
  onClick,
  onDoubleClick,
  onUpdateTask,
  isSearchMatch = true,
  layout,
  pointerEventsNone = false,
  mode,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragY, setDragY] = React.useState(0);
  const [dragX, setDragX] = React.useState(0);
  const [targetDate, setTargetDate] = React.useState<string | null>(null);
  const touchStartY = React.useRef<number | null>(null);
  const touchStartX = React.useRef<number | null>(null);
  const pointerStartY = React.useRef<number | null>(null);
  const pointerStartX = React.useRef<number | null>(null);
  const wasMovedRef = React.useRef(false);
  const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
  }, []);

  const detectDateFromPoint = (x: number, y: number) => {
    if (mode !== 'week') return null;
    try {
      const elements = (document as any).elementsFromPoint?.(x, y) || [];
      for (const el of elements) {
        if (el instanceof HTMLElement && el.dataset.column === 'day') {
          return el.dataset.date || null;
        }
      }
    } catch (e) {
      console.error("Column detection failed", e);
    }
    return null;
  };

  const lastMinutesRef = React.useRef(":00");
  // Calculate current minutes during drag for display
  const getDraggedMinutes = (offsetY: number) => {
    try {
      const startTime = task.startTime || "00:00";
      const [sh, sm] = startTime.split(':').map(Number);
      const originalMins = sh * 60 + sm;
      
      // Convert Y offset to minutes (ROW_HEIGHT_PX = 60 mins)
      const offsetMins = (offsetY / ROW_HEIGHT_PX) * 60;
      const totalMins = originalMins + offsetMins;
      
      // Snap to 15-minute increments
      const snappedMins = Math.round(totalMins / 15) * 15;
      
      // Clamp to valid range
      const clampedMins = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, snappedMins));
      
      const m = clampedMins % 60;
      const result = `:${m.toString().padStart(2, '0')}`;
      lastMinutesRef.current = result;
      return result;
    } catch (e) {
      return lastMinutesRef.current;
    }
  };

  // Calculate top and height if not provided in layout
  const calculatePosition = () => {
    if (layout?.top !== undefined && layout?.height !== undefined) {
      return { top: layout.top, height: layout.height };
    }

    const [sh, sm] = (task.startTime || "00:00").split(':').map(Number);
    const [eh, em] = (task.endTime || "00:00").split(':').map(Number);
    
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    
    const top = ((startMins / 60) - START_HOUR) * ROW_HEIGHT_PX;
    const height = Math.max(20, ((endMins - startMins) / 60) * ROW_HEIGHT_PX);
    
    return { top, height };
  };

  const { top, height } = calculatePosition();

  const applyTimeUpdate = (offsetY: number, newDate?: string | null) => {
    if (!onUpdateTask) return;

    const segmentHeight = ROW_HEIGHT_PX / 4;
    const segmentsMoved = Math.round(offsetY / segmentHeight);
    
    // If we moved horizontally to a new day, we always update, even if vertical segment move is 0
    if (segmentsMoved === 0 && (!newDate || newDate === task.date)) return;

    const [sh, sm] = (task.startTime || "00:00").split(':').map(Number);
    const [eh, em] = (task.endTime || "00:00").split(':').map(Number);
    
    const startTotalMins = sh * 60 + sm + (segmentsMoved * 15);
    const durationMins = (eh * 60 + em) - (sh * 60 + sm);
    const endTotalMins = startTotalMins + durationMins;
    
    // Bounds check - ensure we stay within the calendar range (for time)
    if (startTotalMins < START_HOUR * 60 || endTotalMins > (END_HOUR) * 60) return;

    const newStartHour = Math.floor(startTotalMins / 60);
    const newStartMin = startTotalMins % 60;
    const newEndHour = Math.floor(endTotalMins / 60);
    const newEndMin = endTotalMins % 60;

    const newStartTime = `${newStartHour.toString().padStart(2, '0')}:${newStartMin.toString().padStart(2, '0')}`;
    const newEndTime = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;

    onUpdateTask({
      ...task,
      date: newDate || task.date,
      startTime: newStartTime,
      endTime: newEndTime
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (pointerEventsNone) return;
    setIsDragging(true);
    wasMovedRef.current = false;
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pointerEventsNone || touchStartY.current === null || touchStartX.current === null) return;
    
    // Specifically prevent iPad from scrolling AND block edge swiping
    if (e.cancelable) e.preventDefault();
    
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - touchStartY.current;
    const deltaX = currentX - touchStartX.current;

    // Determine if this is a drag or a tap
    if (Math.abs(deltaY) > 2 || Math.abs(deltaX) > 2) {
      wasMovedRef.current = true;
    }
    
    setDragY(deltaY);
    setDragX(deltaX);

    if (mode === 'week') {
      const date = detectDateFromPoint(currentX, currentY);
      setTargetDate(date);
    }
  };

  const handleTouchEnd = () => {
    if (pointerEventsNone || touchStartY.current === null) return;
    
    applyTimeUpdate(dragY, targetDate);
    setIsDragging(false);
    touchStartY.current = null;
    touchStartX.current = null;
    setDragY(0);
    setDragX(0);
    setTargetDate(null);
    
    // Clear moved state after a tiny delay to ensure click events are caught
    setTimeout(() => {
      wasMovedRef.current = false;
    }, 50);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (pointerEventsNone) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    wasMovedRef.current = false;
    pointerStartY.current = e.clientY;
    pointerStartX.current = e.clientX;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || pointerStartY.current === null || pointerStartX.current === null) return;
    const deltaY = e.clientY - pointerStartY.current;
    const deltaX = e.clientX - pointerStartX.current;

    if (Math.abs(deltaY) > 2 || Math.abs(deltaX) > 2) {
      wasMovedRef.current = true;
    }
    
    setDragY(deltaY);
    setDragX(deltaX);

    if (mode === 'week') {
      const date = detectDateFromPoint(e.clientX, e.clientY);
      setTargetDate(date);
    }
  };

  const handlePointerUp = () => {
    if (!isDragging || pointerStartY.current === null) return;
    applyTimeUpdate(dragY, targetDate);
    setIsDragging(false);
    pointerStartY.current = null;
    pointerStartX.current = null;
    setDragY(0);
    setDragX(0);
    setTargetDate(null);
    
    setTimeout(() => {
      wasMovedRef.current = false;
    }, 50);
  };

  const colorClasses = {
    blue: 'bg-[#e8f0fe] dark:bg-blue-900/20 text-[#1a73e8]',
    green: 'bg-[#e6f4ea] dark:bg-green-900/20 text-[#1e8e3e]',
    yellow: 'bg-[#fef7e0] dark:bg-amber-900/20 text-[#f9ab00]',
    red: 'bg-[#fce8e6] dark:bg-red-900/20 text-[#d93025]',
  };

  const color = (task.color as keyof typeof colorClasses) || 'blue';
  const isActive = isSearchMatch;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: isActive ? (task.isCompleted ? 0.4 : 1) : 0.1, 
        scale: isDragging ? 1.06 : 1,
        y: dragY, 
        x: dragX,
        zIndex: isDragging ? 100 : (layout?.zIndex ?? 10),
      }}
      transition={{ 
        type: "spring", 
        stiffness: 500, 
        damping: 30,
        opacity: { duration: 0.2 },
        y: isDragging ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 },
        x: isDragging ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: (pointerEventsNone || isDragging) ? 1 : 1.02 }}
      whileTap={{ scale: pointerEventsNone ? 1 : 0.96 }}
      drag={false}
      dragMomentum={false}
      dragElastic={0.02}
      onDragStart={() => setIsDragging(true)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        if (pointerEventsNone || isDragging || wasMovedRef.current) return;
        onDoubleClick?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (pointerEventsNone || isDragging || wasMovedRef.current) return;
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
          return;
        }
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          onClick?.();
        }, 250);
      }}
      className={cn(
        "absolute rounded-md p-1.5 pl-4 px-2.5 transition-shadow pointer-events-auto select-none",
        colorClasses[color] || colorClasses.blue,
        !isActive && "grayscale",
        pointerEventsNone && "pointer-events-none select-none",
        "cursor-pointer",
        isDragging ? "shadow-2xl ring-1 ring-white/20" : "shadow-sm"
      )}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: layout?.left ?? '0%',
        width: layout?.width ?? '100%',
        touchAction: pointerEventsNone ? 'auto' : 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Floating Accent Bar */}
      <div 
        className="absolute left-[6px] top-[6px] bottom-[6px] w-[3px] rounded-full bg-current opacity-90" 
      />

      {/* Floating Minute Indicator (iOS Apple Calendar Style) */}
      {isDragging && (
        <div 
          className="absolute left-[-2px] top-0 -translate-x-full pr-3 pointer-events-none z-[100] flex items-center justify-end"
        >
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums leading-none tracking-tight">
            {getDraggedMinutes(dragY)}
          </span>
        </div>
      )}

      <div className="flex flex-col h-full justify-center">
        <h3 className={cn(
          "text-[13px] font-bold leading-tight line-clamp-1 text-[#174ea6] dark:text-blue-300",
          task.isCompleted && "line-through opacity-70"
        )}>
          {task.title}
        </h3>
        <div className="flex items-center gap-1 mt-0.5 opacity-80">
           <Clock className="w-3 h-3" strokeWidth={2.5} />
           <span className="text-[10.5px] font-semibold tabular-nums uppercase">
             {formatNotificationTime(task.startTime).replace(/[AP]M$/, '')}-{formatNotificationTime(task.endTime)}
           </span>
        </div>
      </div>
    </motion.div>
  );
};
