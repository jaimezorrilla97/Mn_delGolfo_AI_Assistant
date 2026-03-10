import * as chrono from "chrono-node";
import { DateTime } from "luxon";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
const DEFAULT_ECOMMERCE_LIST_ID = process.env.CLICKUP_ECOMMERCE_LIST_ID;
const DEFAULT_MARKETING_LIST_ID = process.env.CLICKUP_MARKETING_LIST_ID;

if (!CLICKUP_API_TOKEN) {
    throw new Error("Missing CLICKUP_API_TOKEN in .env");
}

const CLICKUP_BASE_URL = "https://api.clickup.com/api/v2";

async function clickupRequest(path, options = {}) {
    const response = await fetch(`${CLICKUP_BASE_URL}${path}`, {
        ...options,
        headers: {
            Authorization: CLICKUP_API_TOKEN,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const text = await response.text();

    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!response.ok) {
        throw new Error(
            `ClickUp API error ${response.status}: ${JSON.stringify(data, null, 2)}`
        );
    }

    return data;
}

function resolveListId(listId, listName) {
    if (listId) return listId;
    if (listName === "ecommerce") return DEFAULT_ECOMMERCE_LIST_ID;
    if (listName === "marketing") return DEFAULT_MARKETING_LIST_ID;
    return null;
}

async function getAuthorizedUser() {
    return await clickupRequest("/user", {
        method: "GET",
    });
}

async function getListMembers(listId) {
    const data = await clickupRequest(`/list/${listId}/member`, {
        method: "GET",
    });

    return data.members || [];
}

async function resolveAssignees({ assigneeName, assignees, listId }) {
    if (Array.isArray(assignees) && assignees.length > 0) {
        return assignees;
    }

    if (!assigneeName) {
        return [];
    }

    const normalized = assigneeName.trim().toLowerCase();

    if (normalized === "me" || normalized === "myself" || normalized === "jaime") {
        const me = await getAuthorizedUser();
        return [me.user.id];
    }

    const members = await getListMembers(listId);

    const exactMatches = members.filter((member) => {
        const username = member.username?.toLowerCase() || "";
        const email = member.email?.toLowerCase() || "";
        const initials = member.initials?.toLowerCase() || "";

        return (
            username === normalized ||
            email === normalized ||
            initials === normalized
        );
    });

    if (exactMatches.length === 1) {
        return [exactMatches[0].id];
    }

    const partialMatches = members.filter((member) => {
        const username = member.username?.toLowerCase() || "";
        const email = member.email?.toLowerCase() || "";

        return username.includes(normalized) || email.includes(normalized);
    });

    if (partialMatches.length === 1) {
        return [partialMatches[0].id];
    }

    if (partialMatches.length > 1) {
        throw new Error(
            `Multiple ClickUp members matched "${assigneeName}". Please be more specific. Matches: ${partialMatches
                .map((m) => `${m.username} (${m.email})`)
                .join(", ")}`
        );
    }

    throw new Error(`No ClickUp member found for "${assigneeName}".`);
}

function parseDueDateInput(dueDate) {
    if (!dueDate) {
        return { dueDateMs: undefined };
    }

    const dueDateMs = Number(dueDate);

    if (Number.isNaN(dueDateMs)) {
        throw new Error("dueDate must be a valid Unix timestamp in milliseconds as a string.");
    }

    return { dueDateMs };
}

function formatClickupDate(timestamp, hasTime, timezone = "America/Monterrey") {
    if (!timestamp) return "No due date";

    const dt = DateTime.fromMillis(Number(timestamp), { zone: timezone });

    if (!dt.isValid) {
        return String(timestamp);
    }

    return hasTime
        ? dt.toFormat("MMM d, yyyy, h:mm a")
        : dt.toFormat("MMM d, yyyy");
}
function parseNaturalDueDate(dueDateText, timezone = "America/Monterrey") {
    if (!dueDateText) {
        return { dueDateMs: undefined, dueDateTime: false };
    }

    const parsed = chrono.parseDate(dueDateText, new Date(), { forwardDate: true });

    if (!parsed) {
        throw new Error(`Could not parse due date text: "${dueDateText}"`);
    }

    const dt = DateTime.fromJSDate(parsed, { zone: timezone });

    if (!dt.isValid) {
        throw new Error(`Invalid due date after parsing: "${dueDateText}"`);
    }

    const hasExplicitTime =
        /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(dueDateText) ||
        /\bnoon\b|\bmidnight\b/i.test(dueDateText);

    return {
        dueDateMs: dt.toMillis(),
        dueDateTime: hasExplicitTime,
    };
}

function buildTaskConfirmation(task, fallbackDueDateTime = false, timezone = "America/Monterrey") {
    const assignedTo =
        task.assignees && task.assignees.length > 0
            ? task.assignees.map((a) => a.username || a.email || a.id).join(", ")
            : "Unassigned";

    const hasTime =
        typeof task.due_date_time === "boolean"
            ? task.due_date_time
            : fallbackDueDateTime;

    const dueDateText = formatClickupDate(task.due_date, hasTime, timezone);

    return [
        `Task created successfully.`,
        `Name: ${task.name}`,
        `List: ${task.list?.name || "Unknown"}`,
        `Status: ${task.status?.status || "Unknown"}`,
        `Priority: ${task.priority?.priority || "None"}`,
        `Assigned to: ${assignedTo}`,
        `Due date: ${dueDateText}`,
        `URL: ${task.url || "N/A"}`,
    ].join("\n");
}
const server = new McpServer({
    name: "clickup",
    version: "1.1.0",
});

server.tool(
    "create_clickup_task",
    "Create a new ClickUp task in a specific list.",
    {
        listId: z.string().optional().describe("ClickUp List ID"),
        listName: z.enum(["ecommerce", "marketing"]).optional().describe("Friendly list name"),
        name: z.string().describe("Task name"),
        description: z.string().optional().describe("Task description"),
        status: z.string().optional().describe("Task status"),
        priority: z.number().int().min(1).max(4).optional().describe("1=Urgent, 2=High, 3=Normal, 4=Low"),
        dueDateText: z.string().optional().describe('Natural language due date, e.g. "tomorrow 3pm" or "Friday 2pm"'),
        timezone: z.string().optional().default("America/Monterrey").describe('IANA timezone, e.g. "America/Monterrey"'),
        assigneeName: z.string().optional().describe('Name of assignee, for example "Jaime" or "me"'),
        assignees: z.array(z.number()).optional().describe("Array of ClickUp user IDs"),
    },
    async ({
        listId,
        listName,
        name,
        description,
        status,
        priority,
        dueDateText,
        timezone = "America/Monterrey",
        assigneeName,
        assignees,
    }) => {
        const resolvedListId = resolveListId(listId, listName);

        if (!resolvedListId) {
            throw new Error("Missing listId. Provide listId or use listName.");
        }

        if (!name?.trim()) {
            throw new Error("Task name is required.");
        }

        if (!dueDateText) {
            throw new Error("Due date is required.");
        }

        if (!assigneeName && (!assignees || assignees.length === 0)) {
            throw new Error("Assignee is required. Provide assigneeName or assignees.");
        }

        const { dueDateMs, dueDateTime } = parseNaturalDueDate(dueDateText, timezone);

        const resolvedAssignees = await resolveAssignees({
            assigneeName,
            assignees,
            listId: resolvedListId,
        });

        if (!resolvedAssignees || resolvedAssignees.length === 0) {
            throw new Error("Could not resolve assignee to a ClickUp user.");
        }

        const body = {
            name,
            description,
            status,
            priority,
            due_date: dueDateMs,
            due_date_time: Boolean(dueDateTime),
            assignees: resolvedAssignees,
        };

        const data = await clickupRequest(`/list/${resolvedListId}/task`, {
            method: "POST",
            body: JSON.stringify(body),
        });

        return {
            content: [
                {
                    type: "text",
                    text: buildTaskConfirmation(data, Boolean(dueDateTime), timezone),
                },
            ],
        };
    }
);

server.tool(
    "get_clickup_tasks",
    "Get tasks from a ClickUp list.",
    {
        listId: z.string().optional().describe("ClickUp List ID"),
        listName: z.enum(["ecommerce", "marketing"]).optional().describe("Friendly list name"),
        archived: z.boolean().optional(),
        page: z.number().int().min(0).optional(),
        orderBy: z.string().optional().describe("For example: due_date, created, updated"),
        reverse: z.boolean().optional(),
    },
    async ({ listId, listName, archived = false, page = 0, orderBy, reverse }) => {
        const resolvedListId = resolveListId(listId, listName);

        if (!resolvedListId) {
            throw new Error("Missing listId. Provide listId or use listName.");
        }

        const params = new URLSearchParams();
        params.set("archived", String(archived));
        params.set("page", String(page));
        if (orderBy) params.set("order_by", orderBy);
        if (typeof reverse === "boolean") params.set("reverse", String(reverse));

        const data = await clickupRequest(`/list/${resolvedListId}/task?${params.toString()}`, {
            method: "GET",
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

server.tool(
    "update_clickup_task_status",
    "Update the status of an existing ClickUp task.",
    {
        taskId: z.string().describe("ClickUp Task ID"),
        status: z.string().describe("New task status"),
    },
    async ({ taskId, status }) => {
        const data = await clickupRequest(`/task/${taskId}`, {
            method: "PUT",
            body: JSON.stringify({ status }),
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2),
                },
            ],
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);