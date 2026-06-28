# Stravo HD Proxy — Stremio Addon

Filters Stravo streams to **720p and above only**, sorted best quality first.

## What it does
- Fetches streams from Stravo
- Removes 360p and 480p streams
- Sorts 1080p to the top
- Serves as your own Stremio addon manifest

## Deploy to Render (Free)

1. Upload this folder to a new GitHub repo
2. Go to https://render.com and sign in
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
6. Click **Deploy**
7. Your manifest URL will be:
   `https://your-app-name.onrender.com/manifest.json`

## Install in Stremio
1. Open Stremio → Addons
2. Paste your manifest URL in the search bar
3. Click Install

## Adjust quality threshold
In `index.js` find this line:
```
const MIN_QUALITY = 720;
```
Change to `480` to include 480p, or `1080` for 1080p only.
