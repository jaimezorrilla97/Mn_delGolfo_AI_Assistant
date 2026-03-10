# Railway Deployment Guide

This guide describes how to deploy the GA4-Claude-Connector Telegram bot to Railway. The bot requires an always-on environment to support long-polling and cron scheduler duties, making Railway an ideal choice.

## Prerequisites
1. Ensure your codebase is pushed to a GitHub repository.
2. Have your `oauth-client.json` and `token.json` files ready so you can convert them to Base64.
3. Have all your environment variables ready.

## Step 1: Create a Railway Project
1. Go to [Railway](https://railway.app/) and click **New Project**.
2. Select **Deploy from GitHub repo** and choose your `Mn_delGolfo_AI_Assistant` repository.
3. Railway will automatically detect the `Dockerfile` and build your application.

## Step 2: Configure Environment Variables
You will need to encode your GA4 JSON credential files to Base64 to supply them safely as environment variables.
Run these commands in your terminal to get the Base64 strings:
```bash
cat oauth-client.json | base64
cat token.json | base64
```

In your Railway project settings, go to the **Variables** tab and add the following:
* `TELEGRAM_BOT_TOKEN`
* `OPENROUTER_API_KEY`
* `OPENROUTER_MODEL`
* `GROQ_API_KEY`
* `ALLOWED_CHAT_IDS`
* `CLICKUP_CLIENTID`
* `CLICKUP_CLIENT_SECRET`
* `CLICKUP_API_TOKEN`
* `CLICKUP_ECOMMERCE_LIST_ID`
* `CLICKUP_MARKETING_LIST_ID`
* `GA4_PROPERTY_ID`
* `GA4_OAUTH_CLIENT_B64` (Paste the Base64 string from oauth-client.json)
* `GA4_TOKEN_B64` (Paste the Base64 string from token.json)

## Step 3: Add a Persistent Volume
The bot uses a SQLite database to persist conversation history. Railway provides persistent volumes to prevent data loss across deployments.

1. Go to your Railway service's **Settings**.
2. Under the **Volumes** section, click **Add Volume**, name it (e.g., `sqlite-data`), and mount it at the path: `/app/data` (which matches the Dockerfile WORKDIR and volume config).
3. Railway will restart the container with the mounted volume.

## Step 4: Verify Deployment
When the deployment succeeds, verify everything is working:
1. Railway exposes a default `PORT` (e.g., `8080`) which maps to our local Express health check server (`/health`). You can ping this to ensure the server is alive.
2. Open Telegram and send `/status` or `/model` to your bot. It should respond successfully.
3. Restart the container on Railway manually. After it boots up, send another message to verify your conversation history was successfully recovered from the attached Volume.

## CI/CD 
Railway automatically tracks the main branch of your attached GitHub repository and deploys on every push. Make sure to keep your `.gitignore` and `.dockerignore` updated to prevent any secret files from reaching the repository!
