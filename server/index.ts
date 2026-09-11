import { createServer } from "http";
import { createApp } from "./app";
import { setupVite, serveStatic, log } from "./vite";

(async () => {
  const app = await createApp();
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        const loggedPath = path.startsWith("/api/s/")
          ? "/api/s/[redacted]"
          : path;
        let logLine = `${req.method} ${loggedPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          const redacted = { ...capturedJsonResponse };
          if ("token" in redacted) {
            redacted.token = "[redacted]";
          }
          if (
            typeof redacted.path === "string" &&
            redacted.path.startsWith("/s/")
          ) {
            redacted.path = "[redacted]";
          }
          logLine += ` :: ${JSON.stringify(redacted)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  const server = createServer(app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve the app on port 3000 (or PORT env var)
  // this serves both the API and the client.
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
