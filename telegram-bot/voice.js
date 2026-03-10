import { GROQ_API_KEY } from "./config.js";

const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeVoice(audioBuffer) {
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");
  formData.append("model", "whisper-large-v3");

  const response = await fetch(GROQ_WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[voice] Groq transcription error:", error);
    return null;
  }

  const data = await response.json();
  return data.text?.trim() || null;
}
