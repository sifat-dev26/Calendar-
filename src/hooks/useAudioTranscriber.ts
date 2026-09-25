import { useState, useRef, useEffect, useCallback } from "react";

export function useAudioTranscriber() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone input is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Select best supported MIME type
      let chosenMime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          chosenMime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          chosenMime = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          chosenMime = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          chosenMime = "audio/ogg";
        }
      }
      mimeTypeRef.current = chosenMime;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: chosenMime });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250); // Slice every 250ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      return true;
    } catch (err: any) {
      console.error("Audio recording error:", err);
      let msg = "Microphone access was denied or is not available.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Microphone permission denied. Please allow microphone access in your browser settings.";
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
      cleanupStream();
      return false;
    }
  }, [cleanupStream]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    cleanupStream();
  }, [cleanupStream]);

  const stopRecordingAndTranscribe = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
        cleanupStream();
        resolve(null);
        return;
      }

      const recorder = mediaRecorderRef.current;

      recorder.onstop = async () => {
        try {
          setIsRecording(false);
          setIsTranscribing(true);

          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeTypeRef.current || "audio/webm",
          });

          if (audioBlob.size === 0) {
            throw new Error("No audio was recorded. Please try again.");
          }

          // Convert Blob to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);

          reader.onloadend = async () => {
            try {
              const base64Audio = reader.result as string;

              const res = await fetch("/api/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  audioData: base64Audio,
                  mimeType: mimeTypeRef.current || "audio/webm",
                }),
              });

              if (!res.ok) {
                let errMsg = "Audio transcription failed.";
                try {
                  const errJson = await res.json();
                  if (errJson.error) errMsg = errJson.error;
                } catch {
                  // ignored
                }
                throw new Error(errMsg);
              }

              const data = await res.json();
              const transcript = (data.text || "").trim();
              resolve(transcript);
            } catch (err: any) {
              console.error("Transcription API Error:", err);
              setError(err.message || "Failed to transcribe speech.");
              resolve(null);
            } finally {
              setIsTranscribing(false);
              cleanupStream();
            }
          };

          reader.onerror = () => {
            setError("Failed to process recorded audio data.");
            setIsTranscribing(false);
            cleanupStream();
            resolve(null);
          };
        } catch (err: any) {
          setError(err.message || "Recording processing failed.");
          setIsTranscribing(false);
          cleanupStream();
          resolve(null);
        }
      };

      recorder.stop();
    });
  }, [cleanupStream]);

  return {
    isRecording,
    isTranscribing,
    recordingDuration,
    error,
    clearError: () => setError(null),
    startRecording,
    stopRecordingAndTranscribe,
    cancelRecording,
  };
}
