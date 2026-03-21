/**
 * Electron-Hauptprozess: startet den Express-Server (fork) und öffnet ein Fenster.
 * Konfiguration: Datei .env im userData-Verzeichnis (siehe README Desktop).
 */
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { fork } = require("child_process");

const PORT = process.env.PORT || "3001";

let serverProcess = null;
let mainWindow = null;

function userEnvPath() {
  return path.join(app.getPath("userData"), ".env");
}

function ensureUserDataDir() {
  const dir = app.getPath("userData");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error("Benutzerverzeichnis:", e);
  }
}

function ensureUserEnvExample() {
  const dir = app.getPath("userData");
  const example = path.join(dir, ".env.example");
  if (fs.existsSync(example)) return;
  const text = `# Meyton SSMDB2 (Kopie nach .env und Werte eintragen)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=meyton
DB_PASSWORD=
DB_NAME=SSMDB2
PORT=${PORT}
`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(example, text, "utf8");
  } catch (_) {
    /* optional */
  }
}

function serverDirPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "server");
  }
  return path.join(process.resourcesPath, "server");
}

function startServer() {
  const serverDir = serverDirPath();
  const serverScript = path.join(serverDir, "index.js");
  const envFile = userEnvPath();
  const userData = app.getPath("userData");
  const env = {
    ...process.env,
    PORT,
    /** Für API-Hinweis im Browser: wo JSON-Einstellungen liegen (AppImage / Desktop) */
    SCHEIBENANZEIGE_USER_DATA_DIR: userData,
    SCHEIBENANZEIGE_SETTINGS_PATH: path.join(userData, "db-settings.json"),
    SCHEIBENANZEIGE_UI_SETTINGS_PATH: path.join(userData, "ui-settings.json"),
  };
  if (fs.existsSync(envFile)) {
    env.SCHEIBENANZEIGE_ENV_PATH = envFile;
  }

  serverProcess = fork(serverScript, [], {
    cwd: serverDir,
    env,
    silent: false,
  });
  serverProcess.on("error", (err) => {
    console.error("Server-Prozess:", err);
  });
}

function waitForServer(port, maxAttempts = 80) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tryOnce = () => {
      const req = http.get(
        `http://127.0.0.1:${port}/api/health`,
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        n += 1;
        if (n >= maxAttempts) {
          reject(new Error("Server antwortet nicht (Timeout)"));
          return;
        }
        setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Scheibenanzeige",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ensureUserDataDir();
  ensureUserEnvExample();
  startServer();
  try {
    await waitForServer(PORT);
    createWindow();
  } catch (e) {
    console.error(e);
    createWindow();
    if (mainWindow) {
      mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fehler</title></head><body style="font-family:sans-serif;padding:1.5rem"><h1>Server startet nicht</h1><p>${String(
            e.message
          )}</p><p>Unter <strong>Einstellungen</strong> können Sie die Datenbankverbindung speichern (wird in <code>db-settings.json</code> unter <code>${app.getPath(
            "userData"
          )}</code> abgelegt). Optional: <code>${userEnvPath()}</code> (.env).</p></body></html>`
        )}`
      );
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
});
