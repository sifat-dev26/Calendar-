import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function safeGenerateContent(ai: GoogleGenAI, params: any) {
  const primaryModel = params.model || "gemini-2.5-flash";
  let backupModel = "gemini-2.0-flash";
  if (primaryModel === "gemini-2.0-flash") {
    backupModel = "gemini-2.5-flash";
  }

  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const errorStr = (error.message || "").toLowerCase() + " " + JSON.stringify(error).toLowerCase();
    const isQuotaError = 
      error.status === 429 || error.status === 503 || 
      errorStr.includes("quota") || 
      errorStr.includes("429") || 
      errorStr.includes("resource_exhausted") ||
      errorStr.includes("limit");

    if (isQuotaError && backupModel !== primaryModel) {
      console.warn(`[Quota Monitor] Primary model ${primaryModel} reached limit. Attempting backup model ${backupModel}...`);
      try {
        const backupParams = { ...params, model: backupModel };
        return await ai.models.generateContent(backupParams);
      } catch (backupError: any) {
        console.error("[Quota Monitor] Backup model call also reached limits:", backupError);
        throw new Error("Gemini API Daily Free Quota reached. Please try your request again in a few seconds.");
      }
    }
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json({ limit: "50mb" })); // Support large base64 audio and images

  // Initialize Gemini Client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // API Route: Audio Transcription using gemini-3.5-transcribe
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioData, mimeType } = req.body;
      if (!audioData) {
        return res.status(400).json({ error: "audioData (base64) is required" });
      }

      // Strip data URL prefix if sent e.g. "data:audio/webm;base64,..."
      const cleanBase64 = audioData.includes(",") ? audioData.split(",")[1] : audioData;
      const resolvedMime = (mimeType || "audio/webm").split(";")[0];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: resolvedMime,
                data: cleanBase64,
              },
            },
            {
              text: "Transcribe the spoken audio verbatim. Return only the clean transcript text, without quotation marks, markdown wrappers, or commentary.",
            },
          ],
        },
      });

      const transcript = response.text?.trim() || "";
      res.json({ text: transcript });
    } catch (e: any) {
      console.error("Gemini Transcription Error:", e);
      res.status(500).json({ error: e.message || "Failed to transcribe audio" });
    }
  });

  // API Route: Multi-turn Chat and Schedule (Function Calling) using gemini-2.5-flash
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, defaultDate, tasks } = req.body;
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      const todayStr = new Date().toISOString().split("T")[0];
      const contextDate = defaultDate || todayStr;

      const tasksSummary = tasks && Array.isArray(tasks) && tasks.length > 0
        ? tasks.map((t: any) => `- [ID: ${t.id}] "${t.title}" on ${t.date} from ${t.startTime} to ${t.endTime}${t.isCompleted ? ' (Completed)' : ''}`).join("\n")
        : "No scheduled events recorded yet.";

      // Convert frontend messages to Gemini format (role must be 'user' or 'model')
      const formattedContents = messages
        .filter((m: any) => m && m.text && m.text.trim())
        .map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.text }],
        }));

      if (formattedContents.length === 0) {
        return res.status(400).json({ error: "At least one message is required" });
      }

      const modelName = "gemini-2.5-flash";
      const response = await safeGenerateContent(ai, {
        model: modelName,
        contents: formattedContents,
        config: {
          systemInstruction:
            `You are Chronos Assistant, an intelligent, empathetic, and exceptionally capable scheduling and productivity partner. ` +
            `Today is ${todayStr}. The active date viewed by the user is ${contextDate}. If an event date is not specified, default to ${contextDate}. ` +
            `Current user scheduled events:\n${tasksSummary}\n\n` +
            `CAPABILITIES & ACTIONS:\n` +
            `1. Scheduling new events: When the user asks to add, plan, or create events or a routine, call the 'schedule_timetable' tool with an array of events.\n` +
            `2. Bulk Deleting events: When the user asks to delete, clear, remove, or cancel events, call the 'delete_reminders_bulk' tool with an array of their IDs.\n` +
            `3. Bulk Rescheduling: When the user asks to reschedule, delay, move, shift, or adjust times/dates of existing events, call the 'reschedule_reminders_bulk' tool with an array of update objects.\n\n` +
            `CRITICAL EXECUTION RULES FOR BULK ACTIONS:\n` +
            `- When the user requests a bulk or global action (e.g., 'delete all reminders', 'clear everything', 'remove all tasks for today', 'move all afternoon tasks forward by 1 hour'), you MUST process EVERY single target item present in the context.\n` +
            `- NEVER truncate, omit, or stop your execution loop early. If there are 10 reminders matching the request, include all 10.\n` +
            `- You are strictly forbidden from single-item loops. Collect all IDs or updates first and trigger the bulk tool in one single invocation.\n` +
            `- Always resolve relative dates (e.g., 'tomorrow', 'next Monday', 'in 2 days') relative to today's date ${todayStr}.\n` +
            `- Standard daily planner time boundaries are 06:00 to 22:00 (24-hour HH:MM format).\n` +
            `- Alongside any tool calls or general advice, provide a concise, warm, helpful message summarizing what actions were taken or answering the user's question clearly.`,
          tools: [{
            functionDeclarations: [
              {
                name: "schedule_timetable",
                description: "Organizes and adds one or more events to the user's calendar timetable.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    events: {
                      type: Type.ARRAY,
                      description: "List of new events to schedule",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING, description: "Name or summary of the task or event" },
                          date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
                          startTime: { type: Type.STRING, description: "Start time in 24-hour HH:MM format (06:00-22:00)" },
                          endTime: { type: Type.STRING, description: "End time in 24-hour HH:MM format (06:00-22:00)" }
                        },
                        required: ["title", "date", "startTime", "endTime"]
                      }
                    }
                  },
                  required: ["events"]
                }
              },
              {
                name: "delete_reminders_bulk",
                description: "Deletes one or more events from the calendar using their unique IDs.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    ids: {
                      type: Type.ARRAY,
                      description: "Array of task IDs to delete",
                      items: {
                        type: Type.STRING
                      }
                    }
                  },
                  required: ["ids"]
                }
              },
              {
                name: "reschedule_reminders_bulk",
                description: "Modifies the start time, end time, and/or date of one or more existing events in bulk.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    updates: {
                      type: Type.ARRAY,
                      description: "Array of update records for existing tasks",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.STRING, description: "ID of the existing task to adjust" },
                          newStartTime: { type: Type.STRING, description: "New start time in 24h HH:MM format" },
                          newEndTime: { type: Type.STRING, description: "New end time in 24h HH:MM format" },
                          newDate: { type: Type.STRING, description: "Optional new date in YYYY-MM-DD format if shifting days" }
                        },
                        required: ["id", "newStartTime", "newEndTime"]
                      }
                    }
                  },
                  required: ["updates"]
                }
              }
            ]
          }]
        }
      });

      const functionCalls = response.functionCalls || [];
      const textResponse = response.text || "";

      let finalScheduleEvents: any[] = [];
      let finalDeleteEvents: any[] = [];
      let finalModifyEvents: any[] = [];
      let finalMessage = textResponse;

      if (functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name === "schedule_timetable") {
            finalScheduleEvents = (call.args as any)?.events || [];
          } else if (call.name === "delete_reminders_bulk") {
            finalDeleteEvents = (call.args as any)?.ids || [];
          } else if (call.name === "reschedule_reminders_bulk") {
            finalModifyEvents = (call.args as any)?.updates || [];
          }
        }

        if (!finalMessage) {
          const actionDescriptions: string[] = [];
          if (finalScheduleEvents.length > 0) actionDescriptions.push(`added ${finalScheduleEvents.length} event(s)`);
          if (finalDeleteEvents.length > 0) actionDescriptions.push(`removed ${finalDeleteEvents.length} event(s)`);
          if (finalModifyEvents.length > 0) actionDescriptions.push(`adjusted the time for ${finalModifyEvents.length} event(s)`);
          
          finalMessage = actionDescriptions.length > 0
            ? `I've updated your schedule: ${actionDescriptions.join(", ")}.`
            : "I've reviewed your request but no changes were necessary.";
        }
      }

      res.json({
        text: finalMessage,
        events: finalScheduleEvents,
        deleteEvents: finalDeleteEvents,
        modifyEvents: finalModifyEvents
      });
    } catch (e: any) {
      console.error("Gemini API Error:", e);
      res.status(500).json({ error: e.message || "Failed to process chat" });
    }
  });

  // API Route: Chat-to-Task Parser
  app.post("/api/parse-task", async (req, res) => {
    try {
      const { text, defaultDate } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const contextDate = defaultDate || todayStr;

      const response = await safeGenerateContent(ai, {
        model: "gemini-2.5-flash",
        contents: `Today is: ${todayStr}. The selected calendar date is ${contextDate}. Interpret relative dates from that selected date. Parse this natural-language scheduling request: "${text}"`,
        config: {
          systemInstruction:
            "You are a natural-language task scheduler. Understand casual phrasing, spoken-style wording, dates, weekdays, relative dates, and 12/24-hour times. Extract the task name without scheduling words, date (YYYY-MM-DD), startTime and endTime (24-hour HH:MM). Set hasDate=true only when the user explicitly specifies a date or relative date; otherwise set it false and use the selected calendar date. Set hasTime=true only when the user specifies a time; otherwise set it false and use 09:00-10:00 as defaults. If a start time is given without an end or duration, use a one-hour duration. Honor explicit durations or end times. Keep times within 00:00-23:59, do not change the user's intended date or time, and do not invent details in the task name.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              taskName: { type: Type.STRING },
              date: { type: Type.STRING },
              startTime: { type: Type.STRING },
              endTime: { type: Type.STRING },
              hasDate: { type: Type.BOOLEAN },
              hasTime: { type: Type.BOOLEAN },
            },
            required: ["taskName", "date", "startTime", "endTime", "hasDate", "hasTime"],
          },
        },
      });

      const jsonStr = response.text?.trim() || "";
      const parsed = JSON.parse(jsonStr);
      res.json(parsed);
    } catch (e: any) {
      console.error("Gemini API Error:", e);
      res.status(500).json({ error: e.message || "Failed to parse task" });
    }
  });

  // API Route: Photo-to-Task Multimodal Upload
  app.post("/api/parse-image", async (req, res) => {
    try {
      const { base64Image, mimeType } = req.body;
      if (!base64Image || !mimeType) {
        return res
          .status(400)
          .json({ error: "Base64 image and mimeType are required" });
      }

      // Strip potential data URL prefix if sent
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

      const response = await safeGenerateContent(ai, {
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            {
              text: "Analyze this image, extract all action items/tasks, guess their logical durations on a single day schedule (06:00 to 22:00), and return them as a JSON array.",
            },
            { inlineData: { data: cleanBase64, mimeType } },
          ],
        },
        config: {
          systemInstruction:
            "You are a scheduler assistant. Read the handwritten note, syllabus, or post-it list. For each actionable item, extract it with 'taskName', 'date' (YYYY-MM-DD for today or implied), 'startTime' (HH:MM 24h), and 'endTime' (HH:MM 24h). Distribute the tasks logically in the day.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                taskName: { type: Type.STRING },
                date: { type: Type.STRING },
                startTime: { type: Type.STRING },
                endTime: { type: Type.STRING },
              },
              required: ["taskName", "date", "startTime", "endTime"],
            },
          },
        },
      });

      const jsonStr = response.text?.trim() || "[]";
      const parsed = JSON.parse(jsonStr);
      res.json(parsed);
    } catch (e: any) {
      console.error("Gemini API Error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to parse image tasks" });
    }
  });



  // API Route: Gemini Task Checklist Generator
  app.post("/api/task-checklist", async (req, res) => {
    try {
      const { title, description } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Task title is required" });
      }

      const response = await safeGenerateContent(ai, {
        model: "gemini-2.5-flash",
        contents: `Generate a smart subtask checklist for task: "${title}"${description ? ` (Description: ${description})` : ""}`,
        config: {
          systemInstruction:
            "You are a task management breakdown assistant. Break the task down into 3 to 5 actionable subtasks. Also provide one highly impactful focused tip to help complete it.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shortTip: { type: Type.STRING },
              subtasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["shortTip", "subtasks"]
          }
        }
      });

      const jsonStr = response.text?.trim() || "";
      const parsed = JSON.parse(jsonStr);
      res.json(parsed);
    } catch (e: any) {
      console.error("Gemini Checklist Error:", e);
      res.status(500).json({ error: e.message || "Failed to generate checklist" });
    }
  });

  // API Route: AI Task Timeliness Prediction
  app.post("/api/predict-timeliness", async (req, res) => {
    try {
      const { task, history = [] } = req.body;
      if (!task || !task.title) {
        return res.status(400).json({ error: "Task is required" });
      }

      const totalTasks = history.length;
      const completedTasks = history.filter((t: any) => t.isCompleted).length;
      const overallRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;

      const category = task.color || "blue";
      const categoryTasks = history.filter((t: any) => (t.color || "blue") === category);
      const categoryCompleted = categoryTasks.filter((t: any) => t.isCompleted).length;
      const categoryRate = categoryTasks.length > 0 ? Math.round((categoryCompleted / categoryTasks.length) * 100) : null;

      const getTimeSlot = (timeStr: string) => {
        if (!timeStr) return "morning";
        const [h] = timeStr.split(":").map(Number);
        if (h >= 6 && h < 12) return "morning";
        if (h >= 12 && h < 18) return "afternoon";
        if (h >= 18 && h < 22) return "evening";
        return "night";
      };

      const taskSlot = getTimeSlot(task.startTime);
      const slotTasks = history.filter((t: any) => getTimeSlot(t.startTime) === taskSlot);
      const slotCompleted = slotTasks.filter((t: any) => t.isCompleted).length;
      const slotRate = slotTasks.length > 0 ? Math.round((slotCompleted / slotTasks.length) * 100) : null;

      const sameDayTasks = history.filter((t: any) => t.date === task.date && t.id !== task.id);
      const dayCount = sameDayTasks.length;

      // Calculate task duration in minutes
      const getDurationMins = (start: string, end: string) => {
        if (!start || !end) return 60;
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
      };
      const taskDuration = getDurationMins(task.startTime, task.endTime);

      const response = await safeGenerateContent(ai, {
        model: "gemini-2.5-flash",
        contents: `Evaluate the likelihood that the user completes the following task on time:\n` +
          `- Title: "${task.title}"\n` +
          `- Description: "${task.description || "None provided"}"\n` +
          `- Date: ${task.date}\n` +
          `- Segment: ${taskSlot} (${task.startTime} to ${task.endTime}, duration: ${taskDuration} mins)\n` +
          `- Category/Priority: ${category === "blue" ? "Work" : category === "green" ? "Health" : category === "yellow" ? "Personal" : "Urgent"}\n\n` +
          `User Context & History Summary:\n` +
          `- Total historically logged tasks: ${totalTasks}\n` +
          `- Overall task completion rate: ${overallRate !== null ? `${overallRate}%` : "No history yet (new user)"}\n` +
          `- Completion rate for Category "${category}": ${categoryRate !== null ? `${categoryRate}%` : "No category history yet"}\n` +
          `- Completion rate for Time slot "${taskSlot}": ${slotRate !== null ? `${slotRate}%` : "No slot history yet"}\n` +
          `- Number of other tasks scheduled on the same day (${task.date}): ${dayCount}\n\n` +
          `Provide an objective, friendly, and practical timeliness likelihood assessment.`,
        config: {
          systemInstruction:
            "You are an advanced time-management coach and predictive assistant. " +
            "Evaluate factors such as: task complexity (from title), duration, priority, time of day, current schedule density (how packed the day is), and historical track record. " +
            "Synthesize these signals to estimate a completing-on-time probability (likelihood percentage from 0 to 100). " +
            "Also provide a 'riskLevel' ('low' for likelihood >= 75%, 'medium' for 40-74%, 'high' for < 40%). " +
            "Provide a friendly, highly constructive 'analysis' and a supportive 'nudge'. " +
            "If the riskLevel is 'medium' or 'high', you MUST suggest an alternative open slot (between 06:00 and 22:00) as 'suggestedReschedule' with standard HH:MM times, on either the same day or a nearby day (YYYY-MM-DD), with a logical 'reason'. " +
            "For 'low' risk levels, the 'suggestedReschedule' can be null or a helpful future slot suggestion.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              likelihood: { type: Type.INTEGER, description: "Likelihood percentage (0 to 100) of on-time completion." },
              riskLevel: { type: Type.STRING, description: "Classification of risk: 'low', 'medium', or 'high'." },
              analysis: { type: Type.STRING, description: "A detailed 1-2 sentence breakdown of history, task traits, and day density parameters." },
              nudge: { type: Type.STRING, description: "A proactive, supportive coaching recommendation or motivational nudge." },
              suggestedReschedule: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.STRING, description: "Suggested alternative start time (HH:MM format)." },
                  endTime: { type: Type.STRING, description: "Suggested alternative end time (HH:MM format)." },
                  date: { type: Type.STRING, description: "Suggested alternative date (YYYY-MM-DD)." },
                  reason: { type: Type.STRING, description: "Brief justification for this slot choice." }
                },
                required: ["startTime", "endTime", "date", "reason"]
              }
            },
            required: ["likelihood", "riskLevel", "analysis", "nudge"]
          }
        }
      });

      const jsonStr = response.text?.trim() || "";
      const parsed = JSON.parse(jsonStr);
      res.json(parsed);
    } catch (e: any) {
      console.error("Prediction Error:", e);
      res.status(500).json({ error: e.message || "Failed to predict timeliness" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
