import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const DEV_PORT = 4173;
const BASE_URL = `http://127.0.0.1:${DEV_PORT}`;
const AGENT_SESSION = "cvlite-it";
const AGENT_DEFAULT_TIMEOUT_MS = "3000";
const COMMAND_TIMEOUT_MS = 20000;
const READY_TIMEOUT_MS = 12000;
const POLL_INTERVAL_MS = 150;
const FETCH_TIMEOUT_MS = 800;
const FIXTURE_TURN_COUNT = 24;
const FIXTURE_VISIBLE_PRELUDE_MESSAGE_COUNT = 2;
const FIXTURE_BASE_MESSAGE_COUNT = FIXTURE_TURN_COUNT * 2 + FIXTURE_VISIBLE_PRELUDE_MESSAGE_COUNT;
const APPEND_BODY_LINE_COUNT = 28;
const BOTTOM_ALIGNMENT_TOLERANCE_PX = 96;
const DEFAULT_VIEWPORT_WIDTH = 1280;
const NARROW_VIEWPORT_WIDTH = 680;
const VIEWPORT_HEIGHT = 900;
const repoRoot = process.cwd();
const isolatedHome = resolve(repoRoot, ".tmp", "agent-browser-home");
const fixtureWorkspace = "D:\\Integration\\cvlite-it-workspace";
const fixturePrompt = "这是一个用于验证返回按钮在窄视口和长标题条件下仍然保持右侧固定的集成测试提示文本";
const fixtureReply = "integration smoke assistant reply";
const fixturePermissionsPrelude =
  "<permissions instructions>\nFilesystem sandboxing defines which files can be read or written.\n</permissions instructions>";
const fixtureAgentsPrelude = `# AGENTS.md instructions for ${fixtureWorkspace}\n\n<INSTRUCTIONS>\nFollow the repo defaults.\n</INSTRUCTIONS>`;
const fixtureSubagentPrelude =
  '<subagent_notification>\n{"agent_id":"it-agent","status":{"errored":"Interrupted"}}\n</subagent_notification>';
const sessionFilePath = join(isolatedHome, ".codex", "sessions", "2026", "02", "27", "smoke-session.jsonl");
const historyFilePath = join(isolatedHome, ".codex", "history.jsonl");
const pnpmBin = "pnpm";
const resolveAgentBrowserBinary = () => {
  if (process.platform !== "win32") {
    return "agent-browser";
  }

  try {
    const whereOutput = execFileSync("cmd.exe", ["/d", "/s", "/c", "where agent-browser.cmd"], {
      encoding: "utf-8",
      windowsHide: true,
    });
    const wrapperPath = whereOutput
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (!wrapperPath) {
      return "agent-browser";
    }

    const resolvedBinary = resolve(
      dirname(wrapperPath),
      "node_modules",
      "agent-browser",
      "bin",
      "agent-browser-win32-x64.exe",
    );

    if (existsSync(resolvedBinary)) {
      return resolvedBinary;
    }
  } catch {
    return "agent-browser";
  }

  return "agent-browser";
};

const agentBrowserBin = resolveAgentBrowserBinary();
const startedAt = Date.now();
let appendedMessageCount = 0;

const SESSION_SCROLL_METRICS_EXPR =
  "(()=>{const d=document.documentElement;const s=document.querySelector('[data-testid=chat-start-anchor]');" +
  "const l=document.querySelector('[data-testid=jump-latest]');const t=document.querySelector('[data-testid=jump-top]');" +
  "return{scrollY:Math.round(window.scrollY),bottomGap:Math.round(Math.max(0,d.scrollHeight-(window.scrollY+window.innerHeight)))," +
  "startTop:s?Math.round(s.getBoundingClientRect().top):null,latestPending:Boolean(l&&l.classList.contains('pending-latest'))," +
  "hasTopButton:Boolean(t),hasLatestButton:Boolean(l)};})()";

const COPY_BUTTON_STATE_EXPR =
  "(()=>{const b=[...document.querySelectorAll('.chat-copy-button')];const f=b.at(0)?.textContent?.trim()??'';" +
  "return{count:b.length,firstLabel:f};})()";

const CLICK_FIRST_COPY_BUTTON_EXPR =
  "(()=>{const b=document.querySelector('.chat-copy-button');if(!b){return false;}" +
  "b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return true;})()";

const FIRST_TOOL_GROUP_OPEN_EXPR = "Boolean(document.querySelector('details.tool-group')?.open)";

const TOGGLE_FIRST_TOOL_GROUP_EXPR =
  "(()=>{const s=document.querySelector('.tool-summary');if(!s){return false;}" +
  "s.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return true;})()";

const PAGE_OVERFLOW_EXPR =
  "(()=>{const d=document.documentElement;" +
  "return{scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,overflow:d.scrollWidth-d.clientWidth};})()";

const THEME_STATE_EXPR =
  "(()=>{const root=document.documentElement;let stored=null;" +
  "try{stored=window.localStorage.getItem('cv-lite.theme');}catch{}" +
  "return{theme:root.dataset.theme??null,colorScheme:root.style.colorScheme||null,stored};})()";

const buildHeaderLayoutExpr = (buttonTestId) => {
  return (
    "(()=>{" +
    "const copy=document.querySelector('.section-copy')?.getBoundingClientRect();" +
    `const button=document.querySelector('[data-testid="${buttonTestId}"]')?.getBoundingClientRect();` +
    "if(!copy||!button){return null;}" +
    "return{" +
    "copy:{x:Math.round(copy.x),y:Math.round(copy.y),width:Math.round(copy.width),height:Math.round(copy.height)}," +
    "button:{x:Math.round(button.x),y:Math.round(button.y),width:Math.round(button.width),height:Math.round(button.height)}," +
    "sameRow:Math.abs(copy.y-button.y)<=2," +
    "buttonBelowCopy:button.y>copy.y+8" +
    "};})()"
  );
};

const step = (name) => console.log(`\n[STEP] ${name}`);
const pass = (name) => console.log(`[PASS] ${name}`);
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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

const encodeBase64Utf8 = (value) => Buffer.from(value, "utf-8").toString("base64");

const quoteArgForCmd = (value) => {
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '\\"')}"`;
};

const parseJsonOutput = (rawOutput, context) => {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new Error(`No output received for JSON parse in ${context}`);
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`Invalid JSON output in ${context}: ${trimmed}`);
  }
};

const spawnCrossPlatform = (command, args, options) => {
  const isWindows = process.platform === "win32";
  const isWindowsExecutable = isWindows && command.toLowerCase().endsWith(".exe");

  if (!isWindows || isWindowsExecutable) {
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

const createUserMessageText = (index) => {
  if (index === 0) {
    return fixturePrompt;
  }
  return `integration user turn ${index + 1} asks for more detail`;
};

const createAssistantMessageText = (index) => {
  if (index === 0) {
    return fixtureReply;
  }
  return `integration assistant turn ${index + 1} confirms the output and next steps.`;
};

const createFixtureTurnLines = (index) => {
  const lines = [
    JSON.stringify({
      type: "response_item",
      timestamp: nowIso(),
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: createUserMessageText(index) }],
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: nowIso(),
      payload: {
        type: "agent_message",
        text: createAssistantMessageText(index),
      },
    }),
  ];

  if (index === 4) {
    lines.push(
      JSON.stringify({
        type: "response_item",
        timestamp: nowIso(),
        payload: {
          type: "function_call",
          name: "read_file",
          arguments: '{"path":"README.md"}',
          call_id: "it-call-1",
        },
      }),
    );
    lines.push(
      JSON.stringify({
        type: "response_item",
        timestamp: nowIso(),
        payload: {
          type: "function_call_output",
          output: '{"ok":true,"content":"fixture"}',
          call_id: "it-call-1",
        },
      }),
    );
  }

  return lines;
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
        role: "developer",
        content: [{ type: "input_text", text: fixturePermissionsPrelude }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: nowIso(),
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: fixtureAgentsPrelude }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: nowIso(),
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: fixtureSubagentPrelude }],
      },
    }),
  ];

  for (let index = 0; index < FIXTURE_TURN_COUNT; index += 1) {
    lines.push(...createFixtureTurnLines(index));
  }

  return `${lines.join("\n")}\n`;
};

const buildAppendedAssistantLine = (index) => {
  const detailLines = Array.from({ length: APPEND_BODY_LINE_COUNT }, (_, lineIndex) => {
    return `appended-${index}-line-${lineIndex + 1} detailed content for scroll verification`;
  }).join("\n");

  return `${JSON.stringify({
    type: "event_msg",
    timestamp: nowIso(),
    payload: {
      type: "agent_message",
      text: `integration smoke appended reply ${index}\n\n\`\`\`txt\n${detailLines}\n\`\`\``,
    },
  })}\n`;
};

const prepareFixture = async () => {
  step("Prepare isolated fixture data");
  appendedMessageCount = 0;
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
    successPattern = null,
    killOnSuccess = false,
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
    let matchedSuccess = false;

    const resolveOnce = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolveRun(value);
    };

    const finishOnSuccess = () => {
      if (!successPattern || matchedSuccess || !successPattern.test(stdout)) {
        return;
      }
      matchedSuccess = true;
      resolveOnce({
        code: 0,
        stdout,
        stderr,
        timedOut: false,
      });
      if (killOnSuccess) {
        setTimeout(() => {
          if (child.exitCode === null) {
            forceKill(child);
          }
        }, 150);
      }
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
      finishOnSuccess();
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

const runEvalJson = async (name, expression, env, options = {}) => {
  const result = await runAgent(name, ["eval", "-b", encodeBase64Utf8(expression)], env, {
    quiet: options.quiet ?? false,
    timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
  });
  return parseJsonOutput(result.stdout, name);
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
  appendedMessageCount += 1;
  const appendedText = `integration smoke appended reply ${appendedMessageCount}`;

  step(`Append fixture message ${appendedMessageCount} for SSE refresh`);
  await appendFile(sessionFilePath, buildAppendedAssistantLine(appendedMessageCount), "utf-8");
  await mkdir(dirname(historyFilePath), { recursive: true });
  await appendFile(historyFilePath, `${JSON.stringify({ session_id: "it-session-uuid", ts: Date.now() })}\n`, "utf-8");
  pass(`Append fixture message ${appendedMessageCount} for SSE refresh`);

  return {
    appendedText,
    expectedMessageCount: FIXTURE_BASE_MESSAGE_COUNT + appendedMessageCount,
  };
};

const waitForSessionMessageCount = async (env, count, timeoutMs = 8000) => {
  step(`Wait for session message count ${count}`);
  const deadline = Date.now() + timeoutMs;
  const pattern = new RegExp(`(Messages|消息数):\\s*${count}\\b`);
  let lastOutput = "";

  while (Date.now() < deadline) {
    try {
      const snapshot = await runAgent(`Capture snapshot for message count ${count}`, ["snapshot"], env, {
        quiet: true,
      });
      lastOutput = snapshot.stdout;
      if (pattern.test(snapshot.stdout)) {
        pass(`Wait for session message count ${count}`);
        return;
      }
    } catch {
      // page may still be loading; keep polling
    }
    await sleep(250);
  }

  throw new Error(`Session message count ${count} not observed. Last output: ${lastOutput.trim()}`);
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

const waitForBodyText = async (env, text, timeoutMs = 9000) => {
  step(`Wait for text: ${text}`);
  const deadline = Date.now() + timeoutMs;
  let lastOutput = "";

  while (Date.now() < deadline) {
    try {
      const snapshot = await runAgent(`Capture snapshot for text: ${text}`, ["snapshot"], env, {
        quiet: true,
      });
      lastOutput = snapshot.stdout;
      if (snapshot.stdout.includes(text)) {
        pass(`Wait for text: ${text}`);
        return;
      }
    } catch {
      // keep polling until timeout
    }
    await sleep(250);
  }

  throw new Error(`Text not observed: ${text}. Last output: ${lastOutput.trim()}`);
};

const readThemeState = async (env, label, quiet = false) => {
  const state = await runEvalJson(`Read theme state (${label})`, THEME_STATE_EXPR, env, {
    quiet,
  });
  assert(typeof state === "object" && state !== null, `Theme state payload is not an object for ${label}`);
  return state;
};

const waitForThemeState = async (env, expectedTheme, timeoutMs = 8000) => {
  step(`Wait for theme state ${expectedTheme}`);
  const deadline = Date.now() + timeoutMs;
  let lastState = null;

  while (Date.now() < deadline) {
    const state = await readThemeState(env, `${expectedTheme} poll`, true);
    lastState = state;
    const matchesTheme = state.theme === expectedTheme;
    const matchesStored = state.stored === expectedTheme;
    const matchesColorScheme = state.colorScheme === expectedTheme;
    if (matchesTheme && matchesStored && matchesColorScheme) {
      pass(`Wait for theme state ${expectedTheme}`);
      return state;
    }
    await sleep(250);
  }

  throw new Error(`Theme state ${expectedTheme} not observed. Last state: ${JSON.stringify(lastState)}`);
};

const readSessionScrollMetrics = async (env, label, quiet = false) => {
  const metrics = await runEvalJson(`Read session scroll metrics (${label})`, SESSION_SCROLL_METRICS_EXPR, env, {
    quiet,
  });

  assert(typeof metrics === "object" && metrics !== null, `Scroll metrics payload is not an object for ${label}`);
  return metrics;
};

const waitForScrollPredicate = async (env, label, predicate, timeoutMs = 8000) => {
  step(`Wait for scroll predicate: ${label}`);
  const deadline = Date.now() + timeoutMs;
  let lastMetrics = null;

  while (Date.now() < deadline) {
    const metrics = await readSessionScrollMetrics(env, `${label} poll`, true);
    lastMetrics = metrics;
    if (predicate(metrics)) {
      pass(`Wait for scroll predicate: ${label}`);
      return metrics;
    }
    await sleep(250);
  }

  throw new Error(`Scroll predicate timeout: ${label}. Last metrics: ${JSON.stringify(lastMetrics)}`);
};

const waitForBottomGapAtMost = async (env, maxGap, label) => {
  return await waitForScrollPredicate(env, `${label}, bottomGap <= ${maxGap}`, (metrics) => {
    return typeof metrics.bottomGap === "number" && metrics.bottomGap <= maxGap;
  });
};

const waitForStartAnchorNearTop = async (env, maxTopDistance = 60) => {
  return await waitForScrollPredicate(env, `start anchor near top <= ${maxTopDistance}`, (metrics) => {
    return typeof metrics.startTop === "number" && metrics.startTop <= maxTopDistance;
  });
};

const waitForLatestPendingState = async (env, pending) => {
  return await waitForScrollPredicate(env, `latest pending state ${pending}`, (metrics) => {
    return Boolean(metrics.latestPending) === pending;
  });
};

const assertSessionListNoHorizontalOverflow = async (env, label) => {
  const viewportMetrics = await runEvalJson(`Read page overflow metrics (${label})`, PAGE_OVERFLOW_EXPR, env, {
    quiet: true,
  });
  assert(
    typeof viewportMetrics?.overflow === "number" && viewportMetrics.overflow <= 1,
    `Page has horizontal overflow on ${label}: ${JSON.stringify(viewportMetrics)}`,
  );
};

const assertHeaderActionPinned = async (env, label, buttonTestId) => {
  const layout = await runEvalJson(`Read header layout (${label})`, buildHeaderLayoutExpr(buttonTestId), env, {
    quiet: true,
  });
  assert(layout !== null, `Header layout is missing for ${label}`);
  assert(layout.sameRow === true, `Header action moved to another row on ${label}: ${JSON.stringify(layout)}`);
  assert(layout.buttonBelowCopy === false, `Header action dropped below title on ${label}: ${JSON.stringify(layout)}`);
};

const assertCopyAndToolRegression = async (env) => {
  const copyState = await runEvalJson("Read copy button state", COPY_BUTTON_STATE_EXPR, env, {
    quiet: true,
  });
  assert(
    typeof copyState?.count === "number" && copyState.count > 0,
    `Copy button is missing. State: ${JSON.stringify(copyState)}`,
  );
  assertMatch(String(copyState.firstLabel ?? ""), /Copy|Copied|复制|已复制/, "Copy button text is unexpected");

  const didClickCopy = await runEvalJson("Click first copy button", CLICK_FIRST_COPY_BUTTON_EXPR, env, {
    quiet: true,
  });
  assert(didClickCopy === true, "Cannot click copy button");

  await waitForBodyText(env, "Tool call", 7000);

  const beforeOpen = await runEvalJson("Read tool-group open state before toggle", FIRST_TOOL_GROUP_OPEN_EXPR, env, {
    quiet: true,
  });
  assert(beforeOpen === false, "Tool group should be collapsed before toggle");

  const didToggle = await runEvalJson("Toggle first tool-group summary", TOGGLE_FIRST_TOOL_GROUP_EXPR, env, {
    quiet: true,
  });
  assert(didToggle === true, "Cannot toggle tool summary");

  const afterOpen = await runEvalJson("Read tool-group open state after toggle", FIRST_TOOL_GROUP_OPEN_EXPR, env, {
    quiet: true,
  });
  assert(afterOpen === true, "Tool group should be expanded after toggle");
};

const runIntegrationFlow = async (env) => {
  await runAgent("Close stale browser session", ["close"], env, {
    allowFailure: true,
    timeoutMs: 5000,
  });
  await runAgent("Open /projects", ["open", `${BASE_URL}/projects`], env, {
    timeoutMs: 12000,
    successPattern: /http:\/\/127\.0\.0\.1:4173\/projects/u,
    killOnSuccess: true,
  });
  await waitForUrlRegex(env, "/projects", /\/projects\/?$/);

  const initialThemeState = await readThemeState(env, "projects initial");
  assert(
    initialThemeState.theme === "light" || initialThemeState.theme === "dark",
    `Unexpected initial theme state: ${JSON.stringify(initialThemeState)}`,
  );

  const toggledTheme = initialThemeState.theme === "dark" ? "light" : "dark";
  await runAgent("Toggle theme on /projects", ["click", "[data-testid='theme-toggle']"], env);
  await waitForThemeState(env, toggledTheme);

  await runAgent("Reload /projects after theme toggle", ["open", `${BASE_URL}/projects`], env, {
    timeoutMs: 12000,
    successPattern: /http:\/\/127\.0\.0\.1:4173\/projects/u,
    killOnSuccess: true,
  });
  await waitForUrlRegex(env, "/projects after theme reload", /\/projects\/?$/);
  await waitForThemeState(env, toggledTheme);

  await runAgent("Capture interactive refs on /projects", ["snapshot", "-i"], env);
  await runAgent("Switch language to zh-CN", ["select", "@e2", "zh-CN"], env);
  await runAgent("Wait for Chinese projects heading", ["wait", "--text", "项目列表"], env);
  await runAgent("Refresh refs after zh-CN switch", ["snapshot", "-i"], env);
  await runAgent("Switch language to en-US", ["select", "@e2", "en-US"], env);
  await runAgent("Wait for English projects heading", ["wait", "--text", "Projects"], env);
  await runAgent("Wait for fixture project card", ["wait", "--text", "cvlite-it-workspace"], env);

  const status = await runAgent("Read SSE status pill", ["get", "text", ".status-pill"], env);
  assertNonEmpty(status.stdout, "SSE status pill is empty");

  await runAgent("Open first project card", ["click", "a.list-item:not([href*='/sessions/'])"], env);
  await waitForUrlRegex(env, "project sessions", /\/projects\/[^/]+$/);
  await waitForSessionMessageCount(env, FIXTURE_BASE_MESSAGE_COUNT);
  await assertSessionListNoHorizontalOverflow(env, "project sessions initial load");
  await runAgent(
    "Set narrow viewport for project sessions header layout",
    ["set", "viewport", String(NARROW_VIEWPORT_WIDTH), String(VIEWPORT_HEIGHT)],
    env,
  );
  await assertSessionListNoHorizontalOverflow(env, "project sessions narrow layout");
  await assertHeaderActionPinned(env, "project sessions narrow layout", "back-project-list");

  const sessionListTitle = await runAgent("Read first session title", ["get", "text", ".list-item-title"], env);
  assertMatch(sessionListTitle.stdout, new RegExp(`^${fixturePrompt}\\s*$`), "Session list title is unexpected");

  const projectSessionsSnapshot = await runAgent("Capture project sessions snapshot", ["snapshot"], env);
  assert(
    !projectSessionsSnapshot.stdout.includes("it-session-uuid"),
    `Session list should not show session ids: ${projectSessionsSnapshot.stdout.trim()}`,
  );
  assert(
    !projectSessionsSnapshot.stdout.includes("permissions instructions"),
    `Session list should not show permissions prelude: ${projectSessionsSnapshot.stdout.trim()}`,
  );
  assert(
    !projectSessionsSnapshot.stdout.includes("subagent_notification"),
    `Session list should not show subagent prelude: ${projectSessionsSnapshot.stdout.trim()}`,
  );

  await runAgent("Open first session detail", ["click", "a.list-item[href*='/sessions/']"], env);
  await waitForUrlRegex(env, "session detail", /\/sessions\/[^/]+$/);
  await waitForBodyText(env, fixturePrompt, 12000);
  await assertSessionListNoHorizontalOverflow(env, "session detail narrow layout");
  await assertHeaderActionPinned(env, "session detail narrow layout", "back-session-list");
  await runAgent(
    "Restore default viewport after header layout checks",
    ["set", "viewport", String(DEFAULT_VIEWPORT_WIDTH), String(VIEWPORT_HEIGHT)],
    env,
  );

  const sessionHeaderTitle = await runAgent("Read session detail title", ["get", "text", ".session-title"], env);
  assertMatch(sessionHeaderTitle.stdout, new RegExp(`^${fixturePrompt}\\s*$`), "Session detail title is unexpected");

  const sessionDetailSnapshot = await runAgent("Capture session detail snapshot", ["snapshot"], env);
  assert(
    !sessionDetailSnapshot.stdout.includes("permissions instructions"),
    `Session detail should hide permissions prelude: ${sessionDetailSnapshot.stdout.trim()}`,
  );
  assert(
    !sessionDetailSnapshot.stdout.includes("subagent_notification"),
    `Session detail should hide subagent prelude: ${sessionDetailSnapshot.stdout.trim()}`,
  );

  await assertCopyAndToolRegression(env);

  await waitForScrollPredicate(env, "jump buttons present on initial load", (metrics) => {
    return Boolean(metrics.hasTopButton) && Boolean(metrics.hasLatestButton);
  });
  await waitForBottomGapAtMost(env, BOTTOM_ALIGNMENT_TOLERANCE_PX, "initial mount bottom alignment");

  await runAgent("Jump to chat top", ["click", "[data-testid='jump-top']"], env);
  const topMetrics = await waitForStartAnchorNearTop(env, 60);
  assert(topMetrics.bottomGap > 320, "Jump to top did not leave enough distance from bottom");

  const firstAppend = await appendAssistantMessage();
  await waitForBodyText(env, firstAppend.appendedText, 12000);
  await waitForLatestPendingState(env, true);

  const afterFirstAppend = await readSessionScrollMetrics(env, "after first append while reading top");
  assert(afterFirstAppend.bottomGap > 320, "Page was forced to latest while user was reading at top");

  await runAgent("Jump to latest", ["click", "[data-testid='jump-latest']"], env);
  await waitForBottomGapAtMost(env, BOTTOM_ALIGNMENT_TOLERANCE_PX, "after manual jump latest");
  await waitForLatestPendingState(env, false);

  const secondAppend = await appendAssistantMessage();
  await waitForBodyText(env, secondAppend.appendedText, 12000);
  await waitForBottomGapAtMost(env, BOTTOM_ALIGNMENT_TOLERANCE_PX, "after append near bottom auto-follow");
  await waitForLatestPendingState(env, false);

  const backSessionListButton = await runAgent(
    "Read back-session-list button text",
    ["get", "text", "[data-testid='back-session-list']"],
    env,
  );
  assertMatch(backSessionListButton.stdout, /Back to session list/, "Back-session-list text is unexpected");
  await runAgent("Back to project sessions", ["click", "[data-testid='back-session-list']"], env);
  await waitForUrlRegex(env, "project sessions after back", /\/projects\/[^/]+$/);
  await waitForSessionMessageCount(env, secondAppend.expectedMessageCount, 10000);
  await assertSessionListNoHorizontalOverflow(env, "project sessions after returning from session detail");

  const backProjectListButton = await runAgent(
    "Read back-project-list button text",
    ["get", "text", "[data-testid='back-project-list']"],
    env,
  );
  assertMatch(backProjectListButton.stdout, /Back to project list/, "Back-project-list text is unexpected");
  await runAgent("Back to projects", ["click", "[data-testid='back-project-list']"], env);
  await waitForUrlRegex(env, "projects page after back", /\/projects\/?$/);
  await waitForBodyText(env, "cvlite-it-workspace", 12000);
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

const safeCloseBrowser = async (env) => {
  await runAgent("Close browser session", ["close"], env, {
    allowFailure: true,
    timeoutMs: 5000,
  });
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
