# 🎮 Steam Manifest Hub

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

**Steam Manifest Hub** is a fast, serverless web application designed to help users search for, download, and generate Steam application manifests and Lua depot keys. 

It acts as a sleek frontend for the [SteamAutoCracks/ManifestHub](https://github.com/SteamAutoCracks/ManifestHub/) database, featuring real-time download tracking, automated game requests, and built-in spam protection using Cloudflare Workers.

---

## ✨ Features

- **🔍 Smart Search:** Instantly search for games, DLCs, and software by AppID or name.
- **📥 Direct Downloads:** Downloads manifest `.zip` files directly from the main database repository.
- **🔑 Lua Generator:** Client-side generation of `.lua` depot key files for use with Steam tools.
- **📊 Real-Time Analytics:** Tracks downloads and Lua generations using a background Cloudflare Worker ping (zero latency for the user).
- **📝 Automated Request System:** Users can request unsupported games. Requests are automatically logged to a Google Sheet and sent to a Discord channel via webhooks.
- **🛡️ Spam Protection:** Cloudflare KV storage enforces IP-based rate limiting (24-hour cooldowns) to prevent analytic inflation and API spam.

---

## 🏗️ Architecture

This project is fully serverless and split into two main parts:

1. **The Frontend (`index.html`, `styles.css`, `script.js`):**
   - Built with Vanilla JavaScript and Tailwind CSS.
   - Handles the UI, animations, local JSON parsing (for blacklists/requests), and client-side Lua generation.
   
2. **The Bridge (Cloudflare Worker):**
   - Intercepts download clicks and Lua generation pings.
   - Communicates with Cloudflare KV to update global download counters.
   - Pushes logs to **Google Apps Script** (Sheets) and **Discord Webhooks**.
   - Handles 302 redirects to the GitHub `zip` endpoints seamlessly.

---

## 🚀 Setup & Deployment

### 1. Frontend Deployment
Simply host the `index.html`, `styles.css`, `script.js`, and your `.json` data files on GitHub Pages, Cloudflare Pages, or Vercel.

### 2. Cloudflare Worker Setup
To enable tracking and the request form:
1. Create a new Cloudflare Worker (e.g., `manifesthub-bridge`).
2. Create a **KV Namespace** (e.g., `manifesthub_storage`).
3. Bind the KV Namespace to your Worker with the variable name `DOWNLOADS`.
4. Update the Webhook and Google Apps Script URLs inside the Worker code.
5. Deploy the Worker and point the `WORKER_URL` in `script.js` to your new Worker endpoint.

---

## ⚠️ Disclaimer

**Please Read Carefully:**
This script and website are for **informational purposes only**. The authors are not responsible for any consequences that may arise from using the provided data.

- This project is **not affiliated** with Valve, Steam, or any other Valve products.
- All manifests are pulled from public, third-party repositories. Please support the original database maintainers.

---

## 👥 Credits

- **Web Edition / UI:** [TrioNine](https://discord.com/invite/x6AjUMngpF)
- **CLI Edition:** © 2026 SSMG4
- **Data Source / Database:** [SteamAutoCracks/ManifestHub](https://github.com/SteamAutoCracks/ManifestHub/)

---

## 📄 License

This project is licensed under the **Apache License 2.0**.
See the [LICENSE](LICENSE) file for details.
