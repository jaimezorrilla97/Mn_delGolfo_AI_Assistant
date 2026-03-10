import cron from "node-cron";
import OpenAI from "openai";
import { DateTime } from "luxon";
import { logger } from "./logger.js";
import {
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  ALLOWED_CHAT_IDS,
  CLICKUP_API_TOKEN,
  CLICKUP_ECOMMERCE_LIST_ID,
  CLICKUP_MARKETING_LIST_ID,
} from "./config.js";

const ECOMMERCE_LIST_ID = CLICKUP_ECOMMERCE_LIST_ID;
const MARKETING_LIST_ID = CLICKUP_MARKETING_LIST_ID;

const CLICKUP_BASE_URL = "https://api.clickup.com/api/v2";
const TIMEZONE = "America/Monterrey";

// ── ClickUp API helpers ──────────────────────────────────────────────

async function clickupRequest(apiPath, options = {}) {
  const response = await fetch(`${CLICKUP_BASE_URL}${apiPath}`, {
    ...options,
    headers: {
      Authorization: CLICKUP_API_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`ClickUp API error ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function getMyUserId() {
  const data = await clickupRequest("/user", { method: "GET" });
  return data.user.id;
}

async function getTasksForList(listId) {
  const params = new URLSearchParams({ archived: "false", page: "0" });
  const data = await clickupRequest(`/list/${listId}/task?${params}`, { method: "GET" });
  return data.tasks || [];
}

// ── Formatting helpers ───────────────────────────────────────────────

const PRIORITY_LABELS = {
  "1": "URGENTE",
  "2": "ALTA",
  "3": "NORMAL",
  "4": "BAJA",
};

function formatDueDate(timestamp) {
  if (!timestamp) return "Sin fecha";
  const dt = DateTime.fromMillis(Number(timestamp), { zone: TIMEZONE });
  return dt.isValid ? dt.toFormat("d MMM") : "Sin fecha";
}

function formatTaskLine(task) {
  const priority = PRIORITY_LABELS[task.priority?.priority] || "NORMAL";
  const status = task.status?.status || "Sin estado";
  const due = formatDueDate(task.due_date);
  return `  • [${priority}] ${task.name} — ${status} — ${due}`;
}

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function buildSummaryMessage(ecommerceTasks, marketingTasks, motivationalPhrase) {
  const now = DateTime.now().setZone(TIMEZONE);
  const dayNameFixed = DAY_NAMES[now.weekday - 1]; // luxon: 1=Mon..7=Sun
  const monthName = MONTH_NAMES[now.month - 1];

  const lines = [];
  lines.push(`📋 *Resumen de Tareas — ${dayNameFixed}, ${now.day} de ${monthName}*`);
  lines.push("");
  lines.push("¡Buenos días! Aquí está tu plan de batalla para hoy:");
  lines.push("");

  if (ecommerceTasks.length > 0) {
    lines.push(`🛒 *Ecommerce* (${ecommerceTasks.length} ${ecommerceTasks.length === 1 ? "tarea" : "tareas"})`);
    ecommerceTasks.forEach((t) => lines.push(formatTaskLine(t)));
    lines.push("");
  }

  if (marketingTasks.length > 0) {
    lines.push(`📣 *Marketing* (${marketingTasks.length} ${marketingTasks.length === 1 ? "tarea" : "tareas"})`);
    marketingTasks.forEach((t) => lines.push(formatTaskLine(t)));
    lines.push("");
  }

  const total = ecommerceTasks.length + marketingTasks.length;
  if (total === 0) {
    lines.push("🎉 ¡No tienes tareas pendientes! Día libre para crear cosas nuevas.");
    lines.push("");
  } else {
    const listCount = (ecommerceTasks.length > 0 ? 1 : 0) + (marketingTasks.length > 0 ? 1 : 0);
    lines.push(`*Total:* ${total} ${total === 1 ? "tarea" : "tareas"} en ${listCount} ${listCount === 1 ? "lista" : "listas"}`);
    lines.push("");
  }

  lines.push(`💪 _${motivationalPhrase}_`);

  return lines.join("\n");
}

// ── Motivational phrase ──────────────────────────────────────────────

const FALLBACK_PHRASES = [
  '"El secreto para avanzar es comenzar." — Mark Twain',
  '"No cuentes los días, haz que los días cuenten." — Muhammad Ali',
  '"El éxito es la suma de pequeños esfuerzos repetidos día tras día." — Robert Collier',
  '"La disciplina es el puente entre metas y logros." — Jim Rohn',
  '"Hoy es un gran día para ser increíble."',
  '"El único límite eres tú mismo."',
  '"Cada día es una nueva oportunidad para cambiar tu vida."',
  '"La acción es la llave del éxito." — Pablo Picasso',
  '"Cree en ti y todo será posible."',
  '"El mejor momento para empezar fue ayer. El segundo mejor es ahora."',
];

async function getMotivationalPhrase() {
  try {
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: OPENROUTER_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content:
            'Dame una frase motivacional corta en español para empezar el día con energía. ' +
            'Puede ser de un autor famoso o una frase original. ' +
            'Responde SOLO con la frase entre comillas y el autor si aplica. Ejemplo: "La disciplina es libertad." — Jocko Willink',
        },
      ],
    });

    const phrase = response.choices[0]?.message?.content?.trim();
    return phrase || FALLBACK_PHRASES[Math.floor(Math.random() * FALLBACK_PHRASES.length)];
  } catch (err) {
    logger.error("scheduler", "Error getting motivational phrase", err.message);
    return FALLBACK_PHRASES[Math.floor(Math.random() * FALLBACK_PHRASES.length)];
  }
}

// ── Core: generate and send daily summary ────────────────────────────

async function sendDailySummary(bot) {
  try {
    logger.info("scheduler", "Generating daily task summary...");

    const myUserId = await getMyUserId();

    // Fetch tasks from both lists in parallel
    const [allEcommerce, allMarketing] = await Promise.all([
      getTasksForList(ECOMMERCE_LIST_ID),
      getTasksForList(MARKETING_LIST_ID),
    ]);

    // Filter: only my tasks, exclude closed/done statuses
    const closedStatuses = ["closed", "done", "complete", "completado", "cerrado"];
    const filterMyOpen = (tasks) =>
      tasks.filter((t) => {
        const isAssignedToMe = t.assignees?.some((a) => a.id === myUserId);
        const isClosed = closedStatuses.includes(t.status?.status?.toLowerCase());
        return isAssignedToMe && !isClosed;
      });

    const ecommerceTasks = filterMyOpen(allEcommerce);
    const marketingTasks = filterMyOpen(allMarketing);

    const motivationalPhrase = await getMotivationalPhrase();
    const message = buildSummaryMessage(ecommerceTasks, marketingTasks, motivationalPhrase);

    for (const chatId of ALLOWED_CHAT_IDS) {
      try {
        const chat = await bot.api.getChat(chatId);
        const name = chat.first_name || "equipo";
        const personalizedMessage = message.replace("¡Buenos días!", `¡Buenos días ${name}!`);

        await bot.api.sendMessage(chatId, personalizedMessage, { parse_mode: "Markdown" });
        logger.info("scheduler", `Summary sent to chat ${chatId}`);
      } catch (err) {
        // Fallback: try without markdown if parsing fails
        logger.error("scheduler", `Markdown failed for chat ${chatId}, retrying plain`, err.message);
        
        const chat = await bot.api.getChat(chatId).catch(() => ({}));
        const name = chat.first_name || "equipo";
        const personalizedMessage = message.replace("¡Buenos días!", `¡Buenos días ${name}!`);

        await bot.api.sendMessage(chatId, personalizedMessage.replace(/[*_]/g, "")).catch(() => {});
      }
    }
  } catch (err) {
    logger.error("scheduler", "Error sending daily summary", err.message);
  }
}

// ── Scheduler entry point ────────────────────────────────────────────

export function startScheduler(bot) {
  if (!CLICKUP_API_TOKEN) {
    logger.warn("scheduler", "Missing CLICKUP_API_TOKEN — daily summary disabled.");
    return;
  }

  // Mon–Fri at 9:00 AM (America/Monterrey)
  cron.schedule("0 9 * * 1-5", () => sendDailySummary(bot), {
    timezone: TIMEZONE,
  });

  logger.info("scheduler", "Daily summary scheduled: Mon–Fri at 9:00 AM (America/Monterrey)");
}
