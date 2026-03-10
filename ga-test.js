import fs from "fs";
import express from "express";
import open from "open";
import { OAuth2Client } from "google-auth-library";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const PROPERTY_ID = "351328841";

const credentials = JSON.parse(fs.readFileSync("oauth-client.json"));
const clientInfo = credentials.installed || credentials.web;

const oauth2Client = new OAuth2Client(
  clientInfo.client_id,
  clientInfo.client_secret,
  "http://localhost:3000/oauth2callback"
);

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

async function authorize() {
  const app = express();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  const server = app.listen(3000, async () => {
    await open(authUrl);
  });

  return new Promise((resolve, reject) => {
    app.get("/oauth2callback", async (req, res) => {
      try {
        const { code, error } = req.query;

        if (error) {
          res.send("Authorization failed. You can close this window.");
          reject(new Error(String(error)));
          server.close();
          return;
        }

        res.send("Authorization successful. You can close this window.");

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        fs.writeFileSync("token.json", JSON.stringify(tokens, null, 2));

        server.close();
        resolve(oauth2Client);
      } catch (err) {
        reject(err);
        server.close();
      }
    });
  });
}

async function runReport(authClient) {
  const analyticsDataClient = new BetaAnalyticsDataClient({
    authClient,
  });

  const [response] = await analyticsDataClient.runReport({
    property: `properties/${PROPERTY_ID}`,
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "totalRevenue" }],
  });

  console.log(JSON.stringify(response, null, 2));
}

async function main() {
  const authClient = await authorize();
  await runReport(authClient);
}

main().catch(console.error);