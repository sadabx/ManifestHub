export default {
  async fetch(request, env, ctx) {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    const downloadId = url.searchParams.get("download");
    const userIp = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

    const sbUrl = env.SUPABASE_URL;
    const sbKey = env.SUPABASE_SERVICE_ROLE_KEY;

    // --- JOB 1: FETCH DYNAMIC TRENDING DATA (Calls Production RPC) ---
    if (request.method === "GET" && url.searchParams.get("top") === "true") {
      try {
        const response = await fetch(
          `${sbUrl}/rest/v1/rpc/get_popular_downloads`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sbKey}`,
              apikey: sbKey,
              "Content-Type": "application/json",
            },
          },
        );
        const data = await response.text();
        return new Response(data, {
          status: 200,
          headers: { ...headers, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers,
        });
      }
    }

    // --- JOB 2: LOGGING INCOMING DOWNLOADS ---
    if (request.method === "GET" && downloadId) {
      const rawGameName = url.searchParams.get("name") || "Unknown Game";
      const userId = url.searchParams.get("uid") || null;
      const isPing = request.headers.get("Sec-Fetch-Mode") === "cors";

      let gameName = rawGameName;
      let downloadType = "Legacy";

      if (rawGameName.includes(" - ")) {
        const parts = rawGameName.split(" - ");
        gameName = parts[0];
        const suffix = parts[1].toLowerCase();
        if (suffix.includes("lua")) {
          downloadType = ".lua";
        } else if (suffix.includes("manifest")) {
          downloadType = ".manifest";
        }
      } else if (rawGameName.toLowerCase().includes("zip")) {
        gameName = rawGameName
          .replace(/\s*\(zip\)/gi, "")
          .replace(/\s*[-–]\s*zip/gi, "");
        downloadType = "ZIP";
      } else if (rawGameName.toLowerCase().includes("legacy")) {
        gameName = rawGameName
          .replace(/\s*\(legacy\)/gi, "")
          .replace(/\s*[-–]\s*legacy/gi, "");
        downloadType = "Legacy";
      }

      // Dedup key: ip + appId + downloadType, expires after 30s
      if (env.DEDUP_KV) {
        try {
          const dedupKey = `dedup:${userIp}:${downloadId}:${downloadType}`;
          const existing = await env.DEDUP_KV.get(dedupKey);
          if (existing) {
            return new Response("Duplicate skipped", { status: 200, headers });
          }
          await env.DEDUP_KV.put(dedupKey, "1", { expirationTtl: 30 });
        } catch (e) {
          console.error("KV dedup error:", e); // fail open, still log
        }
      }

      const logTask = (async () => {
        // 1. Send cleanly formatted alert message to Discord
        if (env.DOWNLOAD_WEBHOOK_URL) {
          try {
            await fetch(env.DOWNLOAD_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: `**Download**: \`${gameName}\` (${downloadType})`,
              }),
            });
          } catch (e) {
            console.error("Discord notice failed:", e);
          }
        }

        // 2. Write global temporary event row for the daily JSON rollup.
        try {
          await fetch(`${sbUrl}/rest/v1/download_events`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sbKey}`,
              apikey: sbKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              app_id: parseInt(downloadId),
              download_type: downloadType,
              game_name: gameName,
            }),
          });
        } catch (e) {
          console.error("Download event insert failed:", e);
        }

        // 3. Write personal history row into public.download_history (logged-in users only).
        if (userId) {
          try {
            await fetch(`${sbUrl}/rest/v1/download_history`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${sbKey}`,
                apikey: sbKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                user_id: userId,
                app_id: parseInt(downloadId),
                download_type: downloadType,
                game_name: gameName,
              }),
            });
          } catch (e) {
            console.error("History insert failed:", e);
          }
        }
      })();

      ctx.waitUntil(logTask);

      if (isPing) {
        return new Response("Logged", { status: 200, headers });
      }

      return Response.redirect(
        `https://codeload.github.com/SteamAutoCracks/ManifestHub/zip/refs/heads/${downloadId}`,
        302,
      );
    }

    // --- JOB 3: TOST DOWNLOAD TRACKING ---
    if (request.method === "GET" && url.searchParams.get("tost_download")) {
      const assetType = url.searchParams.get("tost_download");
      const assetName = url.searchParams.get("asset_name") || assetType;

      // Friendly labels for Discord embed
      const platformLabels = {
        "win-setup": { platform: "Windows", label: "Setup EXE" },
        "win-portable": {
          platform: "Windows",
          label: "Portable ZIP",
        },
        appimage: { platform: "Linux", label: "AppImage" },
        "linux-portable": {
          platform: "Linux",
          label: "Portable tar.gz",
        },
        arch: { platform: "Linux", label: "Arch Package" },
        deb: { platform: "Linux", label: "Debian Package" },
        recommended: {
          platform: "Auto-detected",
          label: "Recommended",
        },
      };

      const info = platformLabels[assetType] || {
        platform: "Unknown",
        label: assetType,
      };

      // Dedup: ip + assetType, 30s window
      if (env.DEDUP_KV) {
        try {
          const dedupKey = `dedup:tost:${userIp}:${assetType}`;
          const existing = await env.DEDUP_KV.get(dedupKey);
          if (existing) {
            return new Response(
              JSON.stringify({ status: "duplicate_skipped" }),
              { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
            );
          }
          await env.DEDUP_KV.put(dedupKey, "1", { expirationTtl: 30 });
        } catch (e) {
          console.error("KV dedup error (TOST):", e);
        }
      }

      const userCountry = request.headers.get("CF-IPCountry");
      const ipDisplay =
        userCountry && userCountry !== "XX"
          ? `\`${userIp}\` (${userCountry})`
          : `\`${userIp}\``;

      const logTask = (async () => {
        if (env.TOST_DOWNLOAD_WEBHOOK_URL) {
          try {
            await fetch(env.TOST_DOWNLOAD_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                embeds: [
                  {
                    title: "TOST Download",
                    color: 0x3fb950,
                    fields: [
                      {
                        name: "Platform",
                        value: info.platform,
                        inline: true,
                      },
                      { name: "Asset", value: info.label, inline: true },
                      {
                        name: "IP Address",
                        value: ipDisplay,
                        inline: true,
                      },
                      {
                        name: "File",
                        value: `\`${assetName}\``,
                        inline: false,
                      },
                    ],
                    timestamp: new Date().toISOString(),
                  },
                ],
              }),
            });
          } catch (e) {
            console.error("TOST Discord webhook failed:", e);
          }
        }
      })();

      ctx.waitUntil(logTask);

      return new Response(
        JSON.stringify({ status: "logged", asset: assetType }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    return new Response("ManifestHub Bridge Active", {
      status: 200,
      headers: { ...headers, "Content-Type": "text/plain" },
    });
  },
};
