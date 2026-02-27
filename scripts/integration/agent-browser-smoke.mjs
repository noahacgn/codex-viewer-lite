import { spawn } from "node:child_process";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const DEV_PORT = 4173;
const BASE_URL = `http://127.0.0.1:${DEV_PORT}`;
const AGENT_SESSION = "cvlite-it";
const AGENT_DEFAULT_TIMEOUT_MS = "3000";
const COMMAND_TIMEOUT_MS = 10000;
const READY_TIMEOUT_MS = 12000;
const POLL_INTERVAL_MS = 150;
const FETCH_TIMEOUT_MS = 800;
const repoRoot = process.cwd();
const isolatedHome = resolve(repoRoot, ".tmp", "agent-browser-home");
const fixtureWorkspace = "D:\\Integration\\cvlite-it-workspace";
const fixturePrompt = "integration-smoke-prompt";
const fixtureReply = "integration smoke assistant reply";
const sessionFilePath = join(isolatedHome, ".codex", "sessions", "2026", "02", "27", "smoke-session.jsonl");
const historyFilePath = join(isolatedHome, ".codex", "history.jsonl");
const pnpmBin = "pnpm";
const agentBrowserBin = "agent-browser";
const startedAt = Date.now();

const step = (name) => console.log(`\n[STEP] ${name}`);
const pass = (name) => console.log(`[PASS] ${name}`);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const assertMatch = (value, pattern, message) => {
  if (!pattern.test(value)) {
    throw new Error(`${message}. Actual output: ${value.trim()}`);
  }
};

const assertNonEmpty = (value, message) => {
  if (!value.trim()) {
    throw new Error(message);
  }
};

const nowIso = () => new Date().toISOString();

const quoteArgForCmd = (value) => {
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '\\"')}"`;
};

const spawnCrossPlatform = (command, args, options) => {
  if (process.platform !== "win32") {
    return spawn(command, args, options);
  }
  const commandLine = [command, ...args.map(quoteArgForCmd)].join(" ");
  return spawn("cmd.exe", ["/d", "/s", "/c", commandLine], options);
};

const forceKill = (child) => {
  if (!child.pid) {
    return;
  }
  if (process.platform !== "win32") {
    child.kill("SIGKILL");
    return;
  }
  const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
    stdio: "ignore",
    windowsHide: true,
  });
  killer.unref();
};

const buildFixtureContent = () => {
  const baseTimestamp = nowIso();
  const lines = [
    JSON.stringify({
      type: "session_meta",
      timestamp: baseTimestamp,
      payload: {
        id: "it-session-uuid",
        cwd: fixtureWorkspace,
        timestamp: baseTimestamp,
        instructions: "integration smoke fixture",
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: nowIso(),
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: fixturePrompt }],
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: nowIso(),
      payload: {
        type: "agent_message",
        text: fixtureReply,
      },
    }),
  ];

  return `${lines.join("\n")}\n`;
};

const buildAppendedAssistantLine = () => {
  return `${JSON.stringify({
    type: "event_msg",
    timestamp: nowIso(),
    payload: {
      type: "agent_message",
      text: "integration smoke appended reply",
    },
  })}\n`;
};

const prepareFixture = async () => {
  step("Prepare isolated fixture data");
  await rm(isolatedHome, { recursive: true, force: true });
  await mkdir(dirname(sessionFilePath), { recursive: true });
  await writeFile(sessionFilePath, buildFixtureContent(), "utf-8");
  pass("Prepare isolated fixture data");
};

const createTestEnv = () => {
  return {
    ...process.env,
    USERPROFILE: isolatedHome,
    HOME: isolatedHome,
    AGENT_BROWSER_DEFAULT_TIMEOUT: AGENT_DEFAULT_TIMEOUT_MS,
  };
};

const runCommand = async (name, command, args, options = {}) => {
  const {
    env = process.env,
    cwd = repoRoot,
    timeoutMs = COMMAND_TIMEOUT_MS,
    allowFailure = false,
    quiet = false,
  } = options;

  if (!quiet) {
    step(name);
    console.log(`[CMD] ${[command, ...args].join(" ")}`);
  }

  const result = await new Promise((resolveRun) => {
    const child = spawnCrossPlatform(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const resolveOnce = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolveRun(value);
    };

    const timeoutHandle = setTimeout(() => {
      forceKill(child);
      resolveOnce({
        code: 124,
        stdout,
        stderr,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolveOnce({
        code: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        timedOut: false,
      });
    });
    child.on("close", (code) => {
      resolveOnce({
        code: code ?? 1,
        stdout,
        stderr,
        timedOut: false,
      });
    });
  });

  if (!quiet && result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  if (!quiet && result.stderr.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.timedOut && !allowFailure) {
    throw new Error(`TIMEOUT(${name}) after ${timeoutMs}ms`);
  }
  if (result.code !== 0 && !allowFailure) {
    throw new Error(`Command failed in step "${name}" with exit code ${result.code}`);
  }

  if (!quiet) {
    pass(name);
  }
  return result;
};

const runAgent = async (name, args, env, options = {}) => {
  return await runCommand(name, agentBrowserBin, ["--session", AGENT_SESSION, ...args], {
    env,
    allowFailure: options.allowFailure ?? false,
    timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    quiet: options.quiet ?? false,
  });
};

const startDevServer = (env) => {
  step("Start dev server");
  const child = spawnCrossPlatform(pnpmBin, ["dev", "--host", "127.0.0.1", "--port", String(DEV_PORT)], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let logs = "";
  const collect = (chunk) => {
    logs += chunk.toString();
    if (logs.length > 24_000) {
      logs = logs.slice(-24_000);
    }
  };

  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  pass("Start dev server");

  return { child, getLogs: () => logs };
};

const waitForServerReady = async (child) => {
  step("Wait for dev server readiness");
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/projects`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        pass("Wait for dev server readiness");
        return;
      }
    } catch {
      // keep polling until deadline
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Dev server did not become ready within ${READY_TIMEOUT_MS}ms`);
};

const appendAssistantMessage = async () => {
  step("Append fixture message for SSE refresh");
  await appendFile(sessionFilePath, buildAppendedAssistantLine(), "utf-8");
  await mkdir(dirname(historyFilePath), { recursive: true });
  await appendFile(historyFilePath, `${JSON.stringify({ session_id: "it-session-uuid", ts: Date.now() })}\n`, "utf-8");
  pass("Append fixture message for SSE refresh");
};

const waitForSessionCardCount = async (env, count, timeoutMs = 7000) => {
  step(`Wait for session card count ${count}`);
  const deadline = Date.now() + timeoutMs;
  const pattern = new RegExp(`(Messages|消息数):\\s*${count}`);
  let lastOutput = "";

  while (Date.now() < deadline) {
    try {
      const snapshot = await runAgent(`Capture snapshot for count ${count}`, ["snapshot"], env, {
        quiet: true,
      });
      lastOutput = snapshot.stdout;
      if (pattern.test(snapshot.stdout)) {
        pass(`Wait for session card count ${count}`);
        return snapshot.stdout;
      }
    } catch {
      // page may still be loading; keep polling
    }
    await sleep(250);
  }

  throw new Error(`Session card count ${count} not observed. Last output: ${lastOutput.trim()}`);
};

const waitForUrlRegex = async (env, label, pattern, timeoutMs = 7000) => {
  step(`Wait for URL ${label}`);
  const deadline = Date.now() + timeoutMs;
  let lastUrl = "";

  while (Date.now() < deadline) {
    try {
      const current = await runAgent(`Read URL for ${label}`, ["get", "url"], env, { quiet: true });
      lastUrl = current.stdout.trim();
      if (pattern.test(lastUrl)) {
        pass(`Wait for URL ${label}`);
        return;
      }
    } catch {
      // retry until deadline
    }
    await sleep(250);
  }

  throw new Error(`URL ${label} not reached. Last URL: ${lastUrl}`);
};

const stopProcess = async (name, child) => {
  if (!child) {
    return;
  }

  step(`Stop ${name}`);
  if (child.exitCode !== null) {
    pass(`Stop ${name}`);
    return;
  }

  child.kill("SIGTERM");
  await new Promise((resolveStop) => {
    const timeoutHandle = setTimeout(() => {
      if (child.exitCode === null) {
        forceKill(child);
      }
      resolveStop(undefined);
    }, 3000);
    child.once("close", () => {
      clearTimeout(timeoutHandle);
      resolveStop(undefined);
    });
  });
  pass(`Stop ${name}`);
};

const runIntegrationFlow = async (env) => {
  await runAgent("Close stale browser session", ["close"], env, {
    allowFailure: true,
    timeoutMs: 5000,
  });
  await runAgent("Open /projects", ["open", `${BASE_URL}/projects`], env, { timeoutMs: 12000 });
  await waitForUrlRegex(env, "/projects", /\/projects\/?$/);

  await runAgent("Capture interactive refs on /projects", ["snapshot", "-i"], env);
  await runAgent("Switch language to zh-CN", ["select", "@e1", "zh-CN"], env);
  await runAgent("Wait for Chinese projects heading", ["wait", "--text", "项目列表"], env);
  await runAgent("Refresh refs after zh-CN switch", ["snapshot", "-i"], env);
  await runAgent("Switch language to en-US", ["select", "@e1", "en-US"], env);
  await runAgent("Wait for English projects heading", ["wait", "--text", "Projects"], env);
  await runAgent("Wait for fixture project card", ["wait", "--text", "cvlite-it-workspace"], env);

  const status = await runAgent("Read SSE status pill", ["get", "text", ".status-pill"], env);
  assertNonEmpty(status.stdout, "SSE status pill is empty");

  await runAgent("Open first project card", ["click", "a.list-item:not([href*='/sessions/'])"], env);
  await waitForUrlRegex(env, "project sessions", /\/projects\/[^/]+$/);
  await waitForSessionCardCount(env, 2);

  await runAgent("Open first session detail", ["click", "a.list-item[href*='/sessions/']"], env);
  await waitForUrlRegex(env, "session detail", /\/sessions\/[^/]+$/);

  const pageText = await runAgent("Read session detail text", ["get", "text", "body"], env);
  assertMatch(pageText.stdout, /integration-smoke-prompt/, "Fixture prompt was not rendered");

  const backButton = await runAgent("Read back button text", ["get", "text", "a.button"], env);
  assertMatch(backButton.stdout, /Back to projects/, "Back button text is unexpected");
  await runAgent("Back to project sessions", ["click", "a.button"], env);
  await waitForUrlRegex(env, "project sessions after back", /\/projects\/[^/]+$/);

  await appendAssistantMessage();
  await waitForSessionCardCount(env, 3, 7000);
};

const safeCloseBrowser = async (env) => {
  void env;
};

const main = async () => {
  const env = createTestEnv();
  let devServer = null;

  try {
    await prepareFixture();
    devServer = startDevServer(env);
    await waitForServerReady(devServer.child);
    await runIntegrationFlow(env);
    const elapsedMs = Date.now() - startedAt;
    console.log(`\n[RESULT] PASS in ${elapsedMs}ms`);
  } catch (error) {
    console.error(`\n[RESULT] FAIL: ${String(error)}`);
    const logs = devServer?.getLogs?.() ?? "";
    if (logs.trim()) {
      console.error("\n[DEV LOG TAIL]");
      console.error(logs.trim());
    }
    process.exitCode = 1;
  } finally {
    await safeCloseBrowser(env);
    await stopProcess("dev server", devServer?.child ?? null);
  }
};

await main();
process.exit(process.exitCode ?? 0);
