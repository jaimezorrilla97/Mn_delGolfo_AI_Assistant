import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { OAuth2Client } from "google-auth-library";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ROOT_DIR = path.dirname(new URL(import.meta.url).pathname);
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const PROPERTY_ID = process.env.PROPERTY_ID;

if (!PROPERTY_ID) {
  throw new Error("Missing PROPERTY_ID in .env");
}

const credentials = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "oauth-client.json"), "utf8")
);

const token = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "token.json"), "utf8")
);

const clientInfo = credentials.installed || credentials.web;

const oauth2Client = new OAuth2Client(
  clientInfo.client_id,
  clientInfo.client_secret
);

oauth2Client.setCredentials(token);

const analyticsDataClient = new BetaAnalyticsDataClient({
  authClient: oauth2Client,
});

async function runGaReport({
  startDate,
  endDate,
  dimensions = [],
  metrics = [],
  limit = 20,
  orderByMetric = null,
}) {
  const orderBys = orderByMetric
    ? [{ metric: { metricName: orderByMetric }, desc: true }]
    : undefined;

  const [response] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    limit,
    orderBys,
  });

  return {
    dimensionHeaders: response.dimensionHeaders ?? [],
    metricHeaders: response.metricHeaders ?? [],
    rows: response.rows ?? [],
    rowCount: response.rowCount ?? 0,
    totals: response.totals ?? [],
  };
}

function getRowKey(row) {
  return JSON.stringify(
    (row.dimensionValues ?? []).map((dimension) => dimension.value ?? "")
  );
}

function parseMetricValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildMetricObject(metricHeaders = [], metricValues = []) {
  const result = {};

  for (let i = 0; i < metricHeaders.length; i++) {
    const metricName = metricHeaders[i]?.name ?? `metric_${i}`;
    const rawValue = metricValues[i]?.value ?? "0";
    result[metricName] = parseMetricValue(rawValue);
  }

  return result;
}

function buildDimensionObject(dimensionHeaders = [], dimensionValues = []) {
  const result = {};

  for (let i = 0; i < dimensionHeaders.length; i++) {
    const dimensionName = dimensionHeaders[i]?.name ?? `dimension_${i}`;
    result[dimensionName] = dimensionValues[i]?.value ?? "";
  }

  return result;
}

function calculateDelta(currentValue, previousValue) {
  return currentValue - previousValue;
}

function calculatePercentChange(currentValue, previousValue) {
  if (previousValue === 0) {
    if (currentValue === 0) return 0;
    return null;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

function mergeComparisonRows({
  currentData,
  previousData,
  metrics,
}) {
  const currentMap = new Map();
  const previousMap = new Map();

  for (const row of currentData.rows ?? []) {
    currentMap.set(getRowKey(row), row);
  }

  for (const row of previousData.rows ?? []) {
    previousMap.set(getRowKey(row), row);
  }

  const allKeys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const mergedRows = [];

  for (const key of allKeys) {
    const currentRow = currentMap.get(key);
    const previousRow = previousMap.get(key);

    const dimensionObject = buildDimensionObject(
      currentData.dimensionHeaders,
      currentRow?.dimensionValues ?? previousRow?.dimensionValues ?? []
    );

    const currentMetrics = buildMetricObject(
      currentData.metricHeaders,
      currentRow?.metricValues ?? []
    );

    const previousMetrics = buildMetricObject(
      previousData.metricHeaders,
      previousRow?.metricValues ?? []
    );

    const deltaMetrics = {};
    const percentChangeMetrics = {};

    for (const metric of metrics) {
      const currentValue = currentMetrics[metric] ?? 0;
      const previousValue = previousMetrics[metric] ?? 0;

      deltaMetrics[metric] = calculateDelta(currentValue, previousValue);
      percentChangeMetrics[metric] = calculatePercentChange(
        currentValue,
        previousValue
      );
    }

    mergedRows.push({
      dimensions: dimensionObject,
      current: currentMetrics,
      previous: previousMetrics,
      delta: deltaMetrics,
      percentChange: percentChangeMetrics,
    });
  }

  return mergedRows;
}

const server = new McpServer({
  name: "ga4",
  version: "1.0.0",
});

server.tool(
  "ga4_overview",
  "Get GA4 overview metrics for a date range.",
  {
    startDate: z.string(),
    endDate: z.string(),
  },
  async ({ startDate, endDate }) => {
    const data = await runGaReport({
      startDate,
      endDate,
      metrics: ["sessions", "activeUsers", "transactions", "totalRevenue"],
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "ga4_revenue_by_channel",
  "Get sessions, transactions, and revenue by channel.",
  {
    startDate: z.string(),
    endDate: z.string(),
    limit: z.number().optional(),
  },
  async ({ startDate, endDate, limit = 20 }) => {
    const data = await runGaReport({
      startDate,
      endDate,
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "transactions", "totalRevenue"],
      limit,
      orderByMetric: "totalRevenue",
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "ga4_top_pages",
  "Get top landing pages by sessions and revenue.",
  {
    startDate: z.string(),
    endDate: z.string(),
    limit: z.number().optional(),
  },
  async ({ startDate, endDate, limit = 20 }) => {
    const data = await runGaReport({
      startDate,
      endDate,
      dimensions: ["landingPagePlusQueryString"],
      metrics: ["sessions", "transactions", "totalRevenue"],
      limit,
      orderByMetric: "sessions",
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "ga4_custom_report",
  "Run a custom GA4 report.",
  {
    startDate: z.string(),
    endDate: z.string(),
    dimensions: z.array(z.string()).default([]),
    metrics: z.array(z.string()),
    limit: z.number().optional(),
    orderByMetric: z.string().optional(),
  },
  async ({ startDate, endDate, dimensions, metrics, limit = 20, orderByMetric }) => {
    const data = await runGaReport({
      startDate,
      endDate,
      dimensions,
      metrics,
      limit,
      orderByMetric,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "ga4_compare_periods",
  "Compare two GA4 periods and calculate deltas and percent changes.",
  {
    currentStartDate: z.string(),
    currentEndDate: z.string(),
    previousStartDate: z.string(),
    previousEndDate: z.string(),
    dimensions: z.array(z.string()).default([]),
    metrics: z.array(z.string()),
    limit: z.number().optional(),
    orderByMetric: z.string().optional(),
  },
  async ({
    currentStartDate,
    currentEndDate,
    previousStartDate,
    previousEndDate,
    dimensions,
    metrics,
    limit = 20,
    orderByMetric,
  }) => {
    const currentData = await runGaReport({
      startDate: currentStartDate,
      endDate: currentEndDate,
      dimensions,
      metrics,
      limit,
      orderByMetric,
    });

    const previousData = await runGaReport({
      startDate: previousStartDate,
      endDate: previousEndDate,
      dimensions,
      metrics,
      limit,
      orderByMetric,
    });

    const comparisonRows = mergeComparisonRows({
      currentData,
      previousData,
      metrics,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              currentPeriod: {
                startDate: currentStartDate,
                endDate: currentEndDate,
              },
              previousPeriod: {
                startDate: previousStartDate,
                endDate: previousEndDate,
              },
              dimensions,
              metrics,
              rows: comparisonRows,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);