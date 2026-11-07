import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(repositoryRoot, "test", "fixtures", "fake-app-server.mjs");

test("enforces HTTP authentication, origin, CSRF, role, rate-limit, and path boundaries", { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codex-lan-http-test-"));
  const workspace = join(temporaryRoot, "workspace");
  const data = join(temporaryRoot, "data");
  const outsideFile = join(temporaryRoot, "outside-secret.txt");
  const traceFile = join(temporaryRoot, "app-server-trace.jsonl");
  const exitSignalFile = join(temporaryRoot, "exit-app-server.signal");
  const unboundNotificationThread = "00000000-0000-4000-8000-000000000001";
  await Promise.all([mkdir(workspace), mkdir(data), writeFile(outsideFile, "must-not-leak", "utf8")]);
  const port = await availablePort();
  const configFile = join(temporaryRoot, "config.json");
  const attachmentRoot = join(temporaryRoot, "attachments");
  await writeFile(configFile, JSON.stringify({ attachmentRoot }));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      CODEX_CONFIG: configFile,
      CODEX_WEB_HOST: "127.0.0.1",
      CODEX_WEB_PORT: String(port),
      CODEX_WORKDIR: workspace,
      CODEX_WEB_DATA_DIR: data,
      CODEX_TEST_APP_SERVER: fixturePath,
      CODEX_TEST_TRACE_FILE: traceFile,
      CODEX_TEST_STEER_DELAY_MS: "75",
      CODEX_TEST_GOAL_PAUSE_DELAY_MS: "250",
      CODEX_TEST_USER_MESSAGE_DELAY_MS: "500",
      CODEX_TEST_OUTPUT_BURST: "400",
      CODEX_TEST_MCP_RESULT_BYTES: String(64 * 1024),
      CODEX_TEST_PLAN_UPDATE: "1",
      CODEX_TEST_EXIT_SIGNAL_FILE: exitSignalFile,
      CODEX_TEST_UNBOUND_NOTIFICATION_THREAD: unboundNotificationThread,
      CODEX_TEST_SEED_CWD: join(workspace, "默认项目"),
      CODEX_TEST_SEED_COUNT: "205",
      CODEX_TEST_LEGACY_LIST_TITLE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let errors = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.resume();
  child.stderr.on("data", (chunk) => { errors += chunk; });

  try {
    await waitForHealth(origin, child, () => errors);
    const anonymous = await request(origin, "/api/auth/session");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.setupRequired, true);
    assert.match(anonymous.response.headers.get("content-security-policy"), /style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'/);

    const rejectedOrigin = await request(origin, "/api/auth/setup", {
      method: "POST",
      origin: null,
      body: { username: "admin", displayName: "Administrator", password: "admin-pass-123" },
    });
    assert.equal(rejectedOrigin.status, 403);

    const setup = await request(origin, "/api/auth/setup", {
      method: "POST",
      body: { username: "admin", displayName: "Administrator", password: "admin-pass-123" },
    });
    assert.equal(setup.status, 201);
    const adminCookie = sessionCookie(setup.response);
    assert.match(setup.response.headers.get("set-cookie") || "", /HttpOnly/i);
    assert.match(setup.response.headers.get("set-cookie") || "", /SameSite=Strict/i);
    const adminCsrf = setup.body.csrfToken;

    const legacyCookie = adminCookie.replace(/^codex_workspace_session_[0-9a-f]{12}=/, "codex_workspace_session=");
    const migratedLegacySession = await request(origin, "/api/auth/session", { cookie: legacyCookie });
    assert.equal(migratedLegacySession.status, 200);
    assert.match(migratedLegacySession.response.headers.get("set-cookie") || "", /^codex_workspace_session_[0-9a-f]{12}=/);

    const session = await request(origin, "/api/auth/session", { cookie: adminCookie });
    assert.equal(session.status, 200);
    assert.equal(session.body.user.role, "admin");

    const workspaceEventStream = await fetch(`${origin}/api/events`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(workspaceEventStream.status, 200);
    const initialWorkspaceEvent = await readSseUntil(workspaceEventStream.body.getReader(), (contents) => (
      contents.includes('event: server') && contents.includes('"status":"ready"')
    ));
    assert.match(initialWorkspaceEvent, /"status":"ready"/);
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);

    const initializedProjects = await request(origin, "/api/projects", { cookie: adminCookie });
    assert.equal(initializedProjects.status, 200);
    assert.equal(initializedProjects.body.projects.length, 1);
    assert.equal(initializedProjects.body.projects[0].name, "默认项目");
    assert.equal(initializedProjects.body.projects[0].available, true);
    const officialAppThreads = await request(origin, `/api/projects/${initializedProjects.body.projects[0].id}/threads`, { cookie: adminCookie });
    assert.equal(officialAppThreads.status, 200);
    assert.equal(officialAppThreads.body.threads.length, 205);
    assert.equal(officialAppThreads.body.threads.some((thread) => thread.name === "Official App conversation"), true);
    assert.equal(officialAppThreads.body.threads.some((thread) => thread.name === "Recovered legacy title"), true);
    const firstThreadPage = await request(origin, `/api/projects/${initializedProjects.body.projects[0].id}/threads?limit=50`, { cookie: adminCookie });
    assert.equal(firstThreadPage.body.threads.length, 50);
    assert.equal(firstThreadPage.body.hasMore, true);
    assert.equal(firstThreadPage.body.threads.some((thread) => Object.hasOwn(thread, "turns")), false);
    const secondThreadPage = await request(origin, `/api/projects/${initializedProjects.body.projects[0].id}/threads?limit=50&cursor=${encodeURIComponent(firstThreadPage.body.nextCursor)}`, { cookie: adminCookie });
    assert.equal(secondThreadPage.body.threads.length, 50);
    assert.equal(secondThreadPage.body.threads.some((thread) => firstThreadPage.body.threads.some((first) => first.id === thread.id)), false);

    const arbitraryAdminPath = join(temporaryRoot, "admin-selected", "existing-code");
    const arbitraryAdminProject = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { name: "Admin selected project", path: arbitraryAdminPath },
    });
    assert.equal(arbitraryAdminProject.status, 201);
    assert.equal(arbitraryAdminProject.body.project.path, await realpath(arbitraryAdminPath));
    const duplicateAdminPath = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { name: "Duplicate path", path: arbitraryAdminPath },
    });
    assert.equal(duplicateAdminPath.status, 409);

    const missingCsrf = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Rejected project" },
    });
    assert.equal(missingCsrf.status, 403);

    const wrongOrigin = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      origin: "http://invalid.example",
      body: { name: "Rejected project" },
    });
    assert.equal(wrongOrigin.status, 403);

    const createdProject = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { name: "Integration project" },
    });
    assert.equal(createdProject.status, 201);

    const secondProject = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { name: "Second integration project" },
    });
    assert.equal(secondProject.status, 201);

    const createdThread = await request(origin, "/api/threads", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        projectId: createdProject.body.project.id,
        settings: { model: "gpt-5.6-sol", effort: "medium", summary: "detailed" },
        firstMessage: "keep the turn active",
      },
    });
    assert.equal(createdThread.status, 201);
    assert.equal(createdThread.body.thread.name, null);
    const threadId = createdThread.body.thread.id;

    const autoTitleThread = await request(origin, "/api/threads", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        projectId: createdProject.body.project.id,
        settings: { model: "gpt-5.6-sol", effort: "medium", summary: "detailed" },
      },
    });
    assert.equal(autoTitleThread.status, 201);
    assert.equal(autoTitleThread.body.thread.name, null);
    const autoTitleEvents = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const queuedForTitle = await request(origin, `/api/threads/${autoTitleThread.body.thread.id}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "[complete-for-title] Explain quota reset timing" },
    });
    assert.equal(queuedForTitle.status, 202);
    const titleEvents = await readSseUntil(autoTitleEvents.body.getReader(), (contents) => (
      contents.includes('"method":"thread/name/updated"')
      && contents.includes('"threadName":"Quota reset timing"')
      && contents.includes('"method":"turn/completed"')
      && contents.includes(`"threadId":"${autoTitleThread.body.thread.id}"`)
    ));
    assert.match(titleEvents, /Quota reset timing/);
    const threadsAfterAutoTitle = await request(origin, `/api/projects/${createdProject.body.project.id}/threads`, { cookie: adminCookie });
    assert.equal(threadsAfterAutoTitle.body.threads.find((thread) => thread.id === autoTitleThread.body.thread.id)?.name, "Quota reset timing");
    const suggestedTitle = await request(origin, `/api/threads/${autoTitleThread.body.thread.id}/name/suggest`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id },
    });
    assert.equal(suggestedTitle.status, 200, `${JSON.stringify(suggestedTitle.body)}\n${errors}`);
    assert.equal(suggestedTitle.body.name, "Quota reset timing");
    const titleTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const firstTitleTurn = titleTrace.findIndex((entry) => entry.method === "turn/start" && entry.params.threadId === autoTitleThread.body.thread.id);
    const autoTitleSet = titleTrace.findIndex((entry) => entry.method === "thread/name/set" && entry.params.threadId === autoTitleThread.body.thread.id);
    assert.equal(firstTitleTurn >= 0 && autoTitleSet > firstTitleTurn, true);
    assert.equal(titleTrace.slice(firstTitleTurn, autoTitleSet).some((entry) => (
      entry.method === "thread/read" && entry.params.threadId === autoTitleThread.body.thread.id
    )), false, "new-thread title generation must not wait on persisted history");
    const titleThreadStart = titleTrace.find((entry) => entry.method === "thread/start" && entry.params.ephemeral === true);
    assert.equal(titleThreadStart?.params.model, "gpt-5.6-sol");
    const titleTurnStart = titleTrace.find((entry) => entry.method === "turn/start" && entry.params.outputSchema);
    assert.equal(titleTurnStart?.params.effort, "low");
    assert.equal(titleTurnStart?.params.collaborationMode?.settings?.model, "gpt-5.6-sol");
    assert.equal(titleTurnStart?.params.collaborationMode?.settings?.reasoning_effort, "low");

    const visualizationFile = join(temporaryRoot, "chart.html");
    await writeFile(visualizationFile, "<div id=\"chart\">interactive</div>", "utf8");
    const visualizationPath = `/api/threads/${threadId}/visualization?projectId=${createdProject.body.project.id}&path=${encodeURIComponent(visualizationFile)}`;
    const visualization = await fetch(`${origin}${visualizationPath}`, { headers: { Cookie: adminCookie } });
    assert.equal(visualization.status, 200);
    assert.match(visualization.headers.get("content-security-policy") || "", /frame-ancestors 'self'/);
    assert.match(visualization.headers.get("content-security-policy") || "", /https:\/\/cdn\.jsdelivr\.net/);
    const visualizationHtml = await visualization.text();
    assert.match(visualizationHtml, /<div id="chart">interactive<\/div>/);
    assert.match(visualizationHtml, /<link rel="stylesheet" href="\/visualization\.css">/);
    const visualizationStyles = await fetch(`${origin}/visualization.css`);
    assert.equal(visualizationStyles.status, 200);
    assert.match(await visualizationStyles.text(), /--viz-series-1/);
    const anonymousVisualization = await fetch(`${origin}${visualizationPath}`);
    assert.equal(anonymousVisualization.status, 401);
    const invalidVisualization = await request(origin, `/api/threads/${threadId}/visualization?projectId=${createdProject.body.project.id}&path=${encodeURIComponent(outsideFile)}`, { cookie: adminCookie });
    assert.equal(invalidVisualization.status, 400);

    const renamedThread = await request(origin, `/api/threads/${threadId}`, {
      method: "PATCH",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, name: "Renamed conversation" },
    });
    assert.equal(renamedThread.status, 200);
    assert.equal(renamedThread.body.name, "Renamed conversation");
    const threadsAfterRename = await request(origin, `/api/projects/${createdProject.body.project.id}/threads`, { cookie: adminCookie });
    assert.equal(threadsAfterRename.body.threads.find((thread) => thread.id === threadId)?.name, "Renamed conversation");

    const defaultModeSettings = await request(origin, `/api/threads/${threadId}`, {
      method: "PATCH",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        projectId: createdProject.body.project.id,
        settings: { model: "gpt-6.1-luna", effort: "high", collaborationMode: "default" },
      },
    });
    assert.equal(defaultModeSettings.status, 200);
    const defaultModeTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse)
      .findLast((entry) => entry.method === "thread/settings/update" && entry.params.threadId === threadId);
    assert.equal(defaultModeTrace.params.collaborationMode.settings.model, "gpt-6.1-luna");
    assert.equal(defaultModeTrace.params.collaborationMode.settings.reasoning_effort, "high");

    const planSettings = await request(origin, `/api/threads/${threadId}`, {
      method: "PATCH",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        projectId: createdProject.body.project.id,
        settings: { model: "gpt-6.1-luna", effort: "high", collaborationMode: "plan" },
      },
    });
    assert.equal(planSettings.status, 200);
    assert.equal(planSettings.body.settings.model, "gpt-6.1-luna");
    assert.equal(planSettings.body.settings.effort, "high");
    assert.equal(planSettings.body.settings.collaborationMode, "plan");
    const planSettingsTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse)
      .findLast((entry) => entry.method === "thread/settings/update" && entry.params.threadId === threadId);
    assert.equal(planSettingsTrace.params.collaborationMode.settings.model, "gpt-6.1-luna");
    assert.equal(planSettingsTrace.params.collaborationMode.settings.reasoning_effort, "high");

    const forkedThread = await request(origin, `/api/threads/${threadId}/fork`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id },
    });
    assert.equal(forkedThread.status, 201, `${JSON.stringify(forkedThread.body)}\n${errors}`);
    assert.notEqual(forkedThread.body.thread.id, threadId);
    assert.equal(forkedThread.body.thread.name, "Renamed conversation（分支）");
    assert.equal(forkedThread.body.thread.settings.collaborationMode, "plan");
    assert.deepEqual(forkedThread.body.thread.turns, []);
    assert.deepEqual(forkedThread.body.queue, []);
    assert.equal(forkedThread.body.thread.goal, null);
    const forkedThreadId = forkedThread.body.thread.id;
    const loadedFork = await request(origin, `/api/threads/${forkedThreadId}?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
    assert.equal(loadedFork.status, 200);
    assert.equal(loadedFork.body.thread.name, "Renamed conversation（分支）");
    const crossProjectFork = await request(origin, `/api/threads/${threadId}/fork`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: secondProject.body.project.id },
    });
    assert.equal(crossProjectFork.status, 404);
    const forkTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse)
      .findLast((entry) => entry.method === "thread/fork");
    assert.equal(forkTrace.params.threadId, threadId);
    assert.equal(forkTrace.params.cwd, createdProject.body.project.path);
    assert.equal(forkTrace.params.excludeTurns, true);
    assert.equal(forkTrace.params.model, "gpt-6.1-luna");

    const compactSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    assert.equal(compactSse.status, 200);
    const compacted = await request(origin, `/api/threads/${threadId}/compact`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id },
    });
    assert.equal(compacted.status, 202);
    const compactEvents = await readSseUntil(compactSse.body.getReader(), (contents) => (
      contents.includes('"type":"contextCompaction"') && contents.includes('"method":"turn/completed"')
    ));
    assert.match(compactEvents, /item\/started/);
    assert.match(compactEvents, /item\/completed/);

    const questionThread = await request(origin, "/api/threads", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        projectId: createdProject.body.project.id,
        settings: { model: "gpt-5.6-sol", effort: "medium", summary: "detailed" },
        firstMessage: "ask before continuing",
      },
    });
    assert.equal(questionThread.status, 201);
    const questionThreadId = questionThread.body.thread.id;
    const questionSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const queuedQuestion = await request(origin, `/api/threads/${questionThreadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "[request-user-input] ask the user" },
    });
    assert.equal(queuedQuestion.status, 202);
    const questionEvents = await readSseUntil(questionSse.body.getReader(), (contents) => (
      contents.includes('"method":"item/tool/requestUserInput"') && contents.includes("每天换 10 只是上限")
    ));
    const requestId = JSON.parse(questionEvents.match(/data: (\{"method":"item\/tool\/requestUserInput"[^\n]+})/)?.[1] || "null")?.params?.requestId;
    assert.ok(requestId);

    const resumedQuestionSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const resumedQuestionState = await readSseUntil(resumedQuestionSse.body.getReader(), (contents) => contents.includes(requestId));
    assert.match(resumedQuestionState, /userInputRequests/);

    const completionSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const answeredQuestion = await request(origin, `/api/threads/${questionThreadId}/user-input/${encodeURIComponent(requestId)}`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: {
        projectId: createdProject.body.project.id,
        answers: { daily_replacements: { answers: ["最多 10 只"] } },
      },
    });
    assert.equal(answeredQuestion.status, 200);
    const completionEvents = await readSseUntil(completionSse.body.getReader(), (contents) => (
      contents.includes('"method":"serverRequest/resolved"')
        && contents.includes("已收到换仓数量要求，继续执行。")
        && contents.includes('"method":"turn/completed"')
    ));
    assert.match(completionEvents, /turn\/completed/);
    const userInputTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse)
      .find((entry) => entry.responseId === requestId);
    assert.deepEqual(userInputTrace.result, {
      answers: { daily_replacements: { answers: ["最多 10 只"] } },
    });

    const createAsyncQuestion = async (extra = "") => {
      const created = await request(origin, "/api/threads", {
        method: "POST", cookie: adminCookie, csrf: adminCsrf,
        body: { projectId: createdProject.body.project.id, firstMessage: "async question test", settings: { model: "gpt-5.6-sol", effort: "medium" } },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.thread.id;
      const events = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
      await request(origin, `/api/threads/${id}/queue`, {
        method: "POST", cookie: adminCookie, csrf: adminCsrf,
        body: { projectId: createdProject.body.project.id, text: `[request-user-input-async] ${extra}` },
      });
      await readSseUntil(events.body.getReader(), (contents) => {
        const messages = contents.split("\n\n").flatMap((frame) => {
          const data = frame.split("\n").find((line) => line.startsWith("data: {"));
          if (!data) return [];
          try { return [JSON.parse(data.slice(6))]; } catch { return []; }
        }).filter((message) => message.params?.threadId === id);
        return messages.some((message) => message.params?.item?.delivery === "async"
          || message.params?.liveItems?.some((item) => item.delivery === "async"))
          && (!extra.includes("[async-complete]") || messages.some((message) => message.method === "turn/completed"));
      });
      const loaded = await request(origin, `/api/threads/${id}?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
      const question = loaded.body.thread.turns.flatMap((turn) => turn.items).find((item) => item.delivery === "async");
      assert.ok(question);
      assert.equal(question.questions.length, 2);
      return { id, question, loaded };
    };
    const answerAsyncQuestion = (question, answers, projectId = createdProject.body.project.id) => request(origin,
      `/api/threads/${question.id}/async-user-input/${encodeURIComponent(question.question.id)}`, {
        method: "POST", cookie: adminCookie, csrf: adminCsrf, body: { projectId, answers },
      });
    const asyncAnswers = { question_1: { answers: ["先继续玩"] }, question_2: { answers: ["保留旧文件"] } };
    const asyncQuestion = await createAsyncQuestion();
    assert.ok(asyncQuestion.loaded.body.runtime.activeTurnId);
    assert.equal((await answerAsyncQuestion(asyncQuestion, asyncAnswers, secondProject.body.project.id)).status, 404);
    assert.equal((await answerAsyncQuestion(asyncQuestion, { question_1: { answers: ["先继续玩"] } })).status, 400);
    assert.equal((await answerAsyncQuestion(asyncQuestion, { ...asyncAnswers, invented: { answers: ["bad"] } })).status, 400);
    const resolvedAsyncSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const asyncAnswer = await answerAsyncQuestion(asyncQuestion, asyncAnswers);
    assert.equal(asyncAnswer.status, 200);
    assert.equal(asyncAnswer.body.delivery, "guide");
    assert.equal(asyncAnswer.body.turnId, asyncQuestion.loaded.body.runtime.activeTurnId);
    const resolvedAsyncEvents = await readSseUntil(resolvedAsyncSse.body.getReader(), (contents) => contents.includes('"method":"workspace/asyncUserInput/resolved"'));
    assert.ok(resolvedAsyncEvents.includes(asyncQuestion.question.id));
    const reloadedAsync = await request(origin, `/api/threads/${asyncQuestion.id}?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
    assert.ok(reloadedAsync.body.runtime.activeTurnId, "async answering must not finish the running task");
    assert.deepEqual(reloadedAsync.body.thread.answeredAsyncUserInputIds, [asyncQuestion.question.id]);
    const reconnectAsyncSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const reconnectAsyncEvents = await readSseUntil(reconnectAsyncSse.body.getReader(), (contents) => (
      contents.includes('"answeredAsyncUserInputIds":["' + asyncQuestion.question.id + '"]')
    ));
    assert.match(reconnectAsyncEvents, /workspace\/state/);
    assert.equal((await answerAsyncQuestion(asyncQuestion, asyncAnswers)).status, 409);
    const simultaneousAsync = await createAsyncQuestion();
    const simultaneousAnswers = await Promise.all([
      answerAsyncQuestion(simultaneousAsync, asyncAnswers), answerAsyncQuestion(simultaneousAsync, asyncAnswers),
    ]);
    assert.deepEqual(simultaneousAnswers.map((entry) => entry.status).sort(), [200, 409]);
    const failedAsync = await createAsyncQuestion();
    const failedAnswer = await answerAsyncQuestion(failedAsync, { ...asyncAnswers, question_2: { answers: ["[fail-steer]"] } });
    assert.equal(failedAnswer.status, 500);
    const failedQueue = await request(origin, `/api/threads/${failedAsync.id}/queue?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
    assert.deepEqual(failedQueue.body.queue, [], "a rejected steer must not silently queue a second answer");
    const endedAsync = await createAsyncQuestion("[async-complete]");
    const endedAnswer = await answerAsyncQuestion(endedAsync, asyncAnswers);
    assert.equal(endedAnswer.status, 200);
    assert.equal(endedAnswer.body.delivery, "queued");
    assert.match(endedAnswer.body.item.text, /我的回答：先继续玩/);
    assert.equal((await answerAsyncQuestion(endedAsync, asyncAnswers)).status, 409);
    const racedAsync = await createAsyncQuestion("[async-answer-race]");
    const racedAnswer = await answerAsyncQuestion(racedAsync, asyncAnswers);
    assert.equal(racedAnswer.status, 200);
    assert.equal(racedAnswer.body.delivery, "queued", "handle turn completion during answer submission");
    const asyncTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    assert.ok(asyncTrace.some((entry) => entry.method === "turn/steer" && entry.params.threadId === asyncQuestion.id
      && entry.params.input[0].text.includes("我的回答：保留旧文件")));
    assert.equal(asyncTrace.some((entry) => entry.responseId === asyncQuestion.question.id), false, "async questions are not JSON-RPC requests");

    const crossProjectQueue = await request(origin, `/api/threads/${threadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: secondProject.body.project.id, text: "must be rejected" },
    });
    assert.equal(crossProjectQueue.status, 404);

    const burstSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    assert.equal(burstSse.status, 200);
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    const firstTask = await request(origin, `/api/threads/${threadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "keep the turn active" },
    });
    assert.equal(firstTask.status, 202);
    const activeThread = await waitForActiveThread(origin, threadId, createdProject.body.project.id, adminCookie);
    assert.equal(activeThread.body.thread.name, "Renamed conversation");
    const compactedMcp = activeThread.body.thread.turns
      .flatMap((turn) => turn.items || [])
      .find((item) => item.type === "mcpToolCall");
    assert.ok(compactedMcp);
    assert.equal(Object.hasOwn(compactedMcp, "result"), false);
    assert.match(compactedMcp.displayText, /后面的内容已截断显示$/);
    assert.ok(compactedMcp.displayText.length < 17 * 1024);
    const activeTurnId = activeThread.body.runtime.activeTurnId;
    const clearedQueue = `\"method\":\"queue/updated\",\"params\":{\"threadId\":\"${threadId}\",\"queue\":[]`;
    const burstEvents = await readSseUntil(burstSse.body.getReader(), (contents) => (
      contents.includes("burst-399\\n") && contents.includes(clearedQueue)
    ));
    const acceptedMessage = `\"id\":\"${firstTask.body.item.id}\",\"type\":\"userMessage\"`;
    assert.ok(burstEvents.indexOf(acceptedMessage) >= 0);
    assert.ok(burstEvents.indexOf(acceptedMessage) < burstEvents.indexOf(clearedQueue));
    assert.match(burstEvents, /turn\/plan\/updated/);
    assert.equal((burstEvents.match(/item\/commandExecution\/outputDelta/g) || []).length, 1);
    assert.ok(burstEvents.indexOf("burst-0\\n") < burstEvents.indexOf("burst-399\\n"));
    const readsBeforeAccessOnly = (await readFile(traceFile, "utf8")).split(/\r?\n/)
      .filter((line) => line.includes('"method":"thread/read"')).length;
    const accessOnly = await request(origin, `/api/threads/${threadId}?projectId=${createdProject.body.project.id}&history=none`, { cookie: adminCookie });
    assert.equal(accessOnly.status, 200);
    assert.equal(typeof accessOnly.body.accessedAt, "string");
    assert.deepEqual(accessOnly.body.metrics, {});
    const activeAccessOnly = await request(origin, `/api/threads/${threadId}?projectId=${createdProject.body.project.id}&history=none&activeTurnId=${activeTurnId}`, { cookie: adminCookie });
    assert.equal(activeAccessOnly.status, 200);
    assert.equal(typeof activeAccessOnly.body.accessedAt, "string");
    assert.ok(activeAccessOnly.body.metrics[activeTurnId]);
    assert.ok(Object.values(activeAccessOnly.body.metrics[activeTurnId].items || {}).some((item) => item.type === "commandExecution" && item.startedAt));
    const readsAfterAccessOnly = (await readFile(traceFile, "utf8")).split(/\r?\n/)
      .filter((line) => line.includes('"method":"thread/read"')).length;
    assert.equal(readsAfterAccessOnly, readsBeforeAccessOnly);

    const probe = await request(origin, `/api/threads/${threadId}/runtime?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
    assert.equal(probe.status, 200);
    assert.equal(probe.body.threadId, threadId);
    assert.ok(probe.body.runtime.activeTurnId);
    const probeTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const probeRead = probeTrace.findLast((entry) => entry.method === "thread/read" && entry.params.threadId === threadId);
    assert.ok(probeRead);
    assert.equal(probeRead.params.includeTurns, false);

    const directGuidance = await request(origin, `/api/threads/${threadId}/steer`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, expectedTurnId: activeTurnId, text: "direct guidance" },
    });
    assert.equal(directGuidance.status, 202);
    assert.equal(directGuidance.body.turnId, activeTurnId);
    assert.equal(directGuidance.body.item.type, "userMessage");

    const queuedForGuidance = await request(origin, `/api/threads/${threadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "turn this into guidance" },
    });
    assert.equal(queuedForGuidance.status, 202);
    const runtimeAfterQueueing = await request(origin, `/api/threads/${threadId}/runtime?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
    assert.equal(runtimeAfterQueueing.status, 200);
    assert.equal(runtimeAfterQueueing.body.runtime.activeTurnId, activeTurnId);
    const queueItem = queuedForGuidance.body.queue.find((item) => item.text === "turn this into guidance");
    assert.ok(queueItem);
    const steerPath = `/api/threads/${threadId}/queue/${queueItem.id}/steer`;
    const steerOptions = {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, expectedTurnId: activeTurnId },
    };
    const steered = await Promise.all([
      request(origin, steerPath, steerOptions),
      request(origin, steerPath, steerOptions),
    ]);
    assert.deepEqual(steered.map((result) => result.status), [200, 200]);
    assert.equal(steered[0].body.queue.some((item) => item.id === queueItem.id), false);
    assert.equal(steered[0].body.turnId, activeTurnId);
    assert.equal(steered[0].body.item.id, queueItem.id);
    const trace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const steerRequests = trace.filter((entry) => entry.method === "turn/steer" && entry.params.threadId === threadId);
    assert.equal(steerRequests.length, 2);
    assert.equal(steerRequests.find((entry) => entry.params.input[0].text === "direct guidance").params.clientUserMessageId, directGuidance.body.item.id);
    assert.equal(steerRequests.find((entry) => entry.params.input[0].text === queueItem.text).params.clientUserMessageId, queueItem.id);
    const startedTurn = trace.find((entry) => entry.method === "turn/start" && entry.params.threadId === threadId);
    assert.equal(startedTurn.params.clientUserMessageId, firstTask.body.item.id);
    assert.equal(startedTurn.params.collaborationMode.mode, "plan");
    assert.equal(startedTurn.params.collaborationMode.settings.model, "gpt-6.1-luna");
    assert.equal(startedTurn.params.collaborationMode.settings.reasoning_effort, "high");

    const failedGuidanceQueue = await request(origin, `/api/threads/${threadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "[fail-steer] keep this queued" },
    });
    const failedGuidanceItem = failedGuidanceQueue.body.queue.find((item) => item.text.includes("[fail-steer]"));
    assert.ok(failedGuidanceItem);
    const rejectedSteer = await request(origin, `/api/threads/${threadId}/queue/${failedGuidanceItem.id}/steer`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, expectedTurnId: activeTurnId },
    });
    assert.equal(rejectedSteer.status, 500);
    const queueAfterRejectedSteer = await request(origin, `/api/threads/${threadId}/queue?projectId=${createdProject.body.project.id}`, { cookie: adminCookie });
    const restoredFailedGuidance = queueAfterRejectedSteer.body.queue.find((item) => item.id === failedGuidanceItem.id);
    assert.ok(restoredFailedGuidance);
    assert.equal(restoredFailedGuidance.delivery, undefined);
    await request(origin, `/api/threads/${threadId}/queue/${failedGuidanceItem.id}?projectId=${createdProject.body.project.id}`, {
      method: "DELETE",
      cookie: adminCookie,
      csrf: adminCsrf,
    });

    const silentlyCompleted = await request(origin, `/api/threads/${threadId}`, {
      method: "PATCH",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, name: "Silently completed conversation" },
    });
    assert.equal(silentlyCompleted.status, 200);
    const recoveredQueueSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const recoveredQueue = await request(origin, `/api/threads/${threadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "recover queue after a missed completion event" },
    });
    assert.equal(recoveredQueue.status, 202);
    const recoveredQueueEvents = await readSseUntil(recoveredQueueSse.body.getReader(), (contents) => (
      contents.includes(`\"id\":\"${recoveredQueue.body.item.id}\",\"type\":\"userMessage\"`)
        && contents.includes(clearedQueue)
    ));
    assert.match(recoveredQueueEvents, /recover queue after a missed completion event/);
    const recoveredQueueTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const recoveredQueueRead = recoveredQueueTrace.findLast((entry) => entry.method === "thread/read" && entry.params.threadId === threadId);
    const recoveredQueueStart = recoveredQueueTrace.findLast((entry) => entry.method === "turn/start" && entry.params.threadId === threadId);
    assert.ok(recoveredQueueRead);
    assert.equal(recoveredQueueStart.params.clientUserMessageId, recoveredQueue.body.item.id);

    const activeAfterRecovery = await waitForActiveThread(origin, threadId, createdProject.body.project.id, adminCookie);
    const goalWhileRunning = await request(origin, `/api/threads/${threadId}/goal`, {
      method: "PATCH",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, objective: "Keep working until stopped", status: "active" },
    });
    assert.equal(goalWhileRunning.status, 200);
    const queuedBehindGoal = await request(origin, `/api/threads/${threadId}/queue`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, text: "start after the Goal is stopped" },
    });
    assert.equal(queuedBehindGoal.status, 202);
    const stoppedGoalSse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    const stoppedGoal = await request(origin, `/api/threads/${threadId}/interrupt`, {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, turnId: activeAfterRecovery.body.runtime.activeTurnId },
    });
    assert.equal(stoppedGoal.status, 202);
    assert.equal(stoppedGoal.body.goalPauseRequested, true);
    const stopTrace = (await readFile(traceFile, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
    const interruptIndex = stopTrace.findIndex((entry) => entry.method === "turn/interrupt"
      && entry.params.turnId === activeAfterRecovery.body.runtime.activeTurnId);
    const pauseIndex = stopTrace.findIndex((entry) => entry.method === "thread/goal/set"
      && entry.params.threadId === threadId && entry.params.status === "paused");
    assert.ok(interruptIndex >= 0);
    assert.ok(pauseIndex > interruptIndex);
    const stoppedGoalEvents = await readSseUntil(stoppedGoalSse.body.getReader(), (contents) => (
      contents.includes(`\"id\":\"${queuedBehindGoal.body.item.id}\",\"type\":\"userMessage\"`)
        && contents.includes(clearedQueue)
    ));
    assert.match(stoppedGoalEvents, /start after the Goal is stopped/);

    const crossProjectRead = await request(origin, `/api/threads/${threadId}?projectId=${secondProject.body.project.id}`, { cookie: adminCookie });
    assert.equal(crossProjectRead.status, 404);
    const crossProjectUpload = await fetch(`${origin}/api/projects/${secondProject.body.project.id}/files/upload?threadId=${threadId}&name=wrong-project.txt`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: origin,
        "X-Codex-CSRF-Token": adminCsrf,
        "Content-Type": "text/plain",
      },
      body: "must not be stored",
    });
    assert.equal(crossProjectUpload.status, 404);

    const uploadedAttachment = await fetch(`${origin}/api/projects/${createdProject.body.project.id}/files/upload?threadId=${threadId}&name=mobile-check.txt`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: origin,
        "X-Codex-CSRF-Token": adminCsrf,
        "Content-Type": "text/plain",
      },
      body: "attachment upload works",
    });
    assert.equal(uploadedAttachment.status, 201);
    const uploadedFile = (await uploadedAttachment.json()).file;
    assert.equal(await readFile(uploadedFile.path, "utf8"), "attachment upload works");
    assert.ok(uploadedFile.path.startsWith(join(attachmentRoot, createdProject.body.project.id)));
    const ownDownload = await fetch(`${origin}/api/projects/${createdProject.body.project.id}/files/download?path=${encodeURIComponent(uploadedFile.path)}`, { headers: { Cookie: adminCookie } });
    assert.equal(ownDownload.status, 200);
    assert.equal(await ownDownload.text(), "attachment upload works");
    const otherDownload = await fetch(`${origin}/api/projects/${secondProject.body.project.id}/files/download?path=${encodeURIComponent(uploadedFile.path)}`, { headers: { Cookie: adminCookie } });
    assert.equal(otherDownload.status, 403);
    const otherDelete = await request(origin, `/api/projects/${secondProject.body.project.id}/files/attachment?path=${encodeURIComponent(uploadedFile.path)}`, { method: "DELETE", cookie: adminCookie, csrf: adminCsrf });
    assert.equal(otherDelete.status, 403);
    const ownDelete = await request(origin, `/api/projects/${createdProject.body.project.id}/files/attachment?path=${encodeURIComponent(uploadedFile.path)}`, { method: "DELETE", cookie: adminCookie, csrf: adminCsrf });
    assert.equal(ownDelete.status, 200);
    const legacyDirectory = join(createdProject.body.project.path, ".codexlan", "attachments");
    await mkdir(legacyDirectory, { recursive: true });
    const legacyFile = join(legacyDirectory, "legacy.txt");
    await writeFile(legacyFile, "historical attachment");
    const legacyDownload = await fetch(`${origin}/api/projects/${createdProject.body.project.id}/files/download?path=${encodeURIComponent(legacyFile)}`, { headers: { Cookie: adminCookie } });
    assert.equal(legacyDownload.status, 200);
    assert.equal(await legacyDownload.text(), "historical attachment");
    const legacyDelete = await request(origin, `/api/projects/${createdProject.body.project.id}/files/attachment?path=${encodeURIComponent(legacyFile)}`, { method: "DELETE", cookie: adminCookie, csrf: adminCsrf });
    assert.equal(legacyDelete.status, 200);

    const persistedAfterThread = JSON.parse(await readFile(join(data, "workspace-state.json"), "utf8"));
    assert.equal(persistedAfterThread.version, 13);
    assert.equal(persistedAfterThread.threadProjects[threadId], createdProject.body.project.id);
    assert.equal(Object.hasOwn(persistedAfterThread, "threadOwners"), false);
    assert.equal(Object.hasOwn(persistedAfterThread.turnMetrics, unboundNotificationThread), false);
    assert.ok(persistedAfterThread.threadAccesses[setup.body.user.id][threadId]);
    assert.deepEqual(persistedAfterThread.turnMetrics[threadId][activeTurnId].plan, {
      explanation: "Integration plan",
      plan: [
        { step: "Inspect", status: "completed" },
        { step: "Verify", status: "inProgress" },
      ],
    });
    const persistedCommands = Object.values(persistedAfterThread.turnMetrics[threadId][activeTurnId].items)
      .filter((item) => item.type === "commandExecution");
    assert.equal(persistedCommands.length, 1);
    assert.match(persistedCommands[0].snapshot.aggregatedOutput, /^burst-0\n/);
    assert.match(persistedCommands[0].snapshot.aggregatedOutput, /burst-399\n$/);
    assert.equal(persistedCommands[0].snapshot.exitCode, 0);

    const projects = await request(origin, "/api/projects", { cookie: adminCookie });
    assert.equal(projects.status, 200);
    assert.equal(projects.body.projects.some((project) => project.id === createdProject.body.project.id), true);
    const adjacentSecret = join(dirname(createdProject.body.project.path), "outside-secret.txt");
    await writeFile(adjacentSecret, "must-not-leak", "utf8");
    const adminDownloadPath = `/api/admin/files/download?path=${encodeURIComponent(outsideFile)}`;
    const browserDownloadLogin = await fetch(`${origin}${adminDownloadPath}`, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
    });
    assert.equal(browserDownloadLogin.status, 302);
    assert.equal(browserDownloadLogin.headers.get("location"), `/?download=${encodeURIComponent(adminDownloadPath)}`);
    const authenticatedBrowserDownload = await fetch(`${origin}${adminDownloadPath}`, { headers: { Cookie: adminCookie } });
    assert.equal(authenticatedBrowserDownload.status, 200);
    assert.equal(await authenticatedBrowserDownload.text(), "must-not-leak");
    const traversal = await request(origin, `/api/projects/${createdProject.body.project.id}/files/download?path=${encodeURIComponent("../outside-secret.txt")}`, { cookie: adminCookie });
    assert.equal(traversal.status, 403);
    assert.doesNotMatch(JSON.stringify(traversal.body), /must-not-leak/);

    const unavailablePath = `${createdProject.body.project.path}-offline`;
    await rename(createdProject.body.project.path, unavailablePath);
    const projectsWithUnavailable = await request(origin, "/api/projects", { cookie: adminCookie });
    const unavailableProject = projectsWithUnavailable.body.projects.find((project) => project.id === createdProject.body.project.id);
    assert.equal(unavailableProject.available, false);
    const unavailableThreads = await request(origin, `/api/projects/${createdProject.body.project.id}/threads`, { cookie: adminCookie });
    assert.equal(unavailableThreads.status, 409);
    const persistenceTrigger = await request(origin, "/api/projects", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { name: "Persistence trigger" },
    });
    assert.equal(persistenceTrigger.status, 201);
    const stateWithUnavailable = JSON.parse(await readFile(join(data, "workspace-state.json"), "utf8"));
    assert.equal(stateWithUnavailable.projects.some((project) => project.id === createdProject.body.project.id), true);
    await rename(unavailablePath, createdProject.body.project.path);

    const healthBeforeRecovery = await fetch(`${origin}/api/health`).then((response) => response.json());
    const recoverySse = await fetch(`${origin}/api/events`, { headers: { Cookie: adminCookie } });
    assert.equal(recoverySse.status, 200);
    await writeFile(exitSignalFile, "exit", "utf8");
    const serverEvents = await readSseUntil(recoverySse.body.getReader(), (contents) => {
      const offline = contents.indexOf('"status":"offline"');
      return offline >= 0 && contents.indexOf('"status":"ready"', offline) > offline;
    });
    assert.match(serverEvents, /event: server/);
    const healthAfterRecovery = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(healthAfterRecovery.status, "alive");
    assert.equal(healthAfterRecovery.codexStatus, "ready");
    assert.equal(healthAfterRecovery.pid, healthBeforeRecovery.pid);

    const member = await request(origin, "/api/users", {
      method: "POST",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { username: "member", displayName: "Member", password: "member-pass-123" },
    });
    assert.equal(member.status, 201);

    const memberLogin = await request(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "member", password: "member-pass-123" },
    });
    assert.equal(memberLogin.status, 200);
    const memberCookie = sessionCookie(memberLogin.response);
    const memberCsrf = memberLogin.body.csrfToken;

    const rejectedProfileWithoutCsrf = await request(origin, "/api/auth/profile", {
      method: "PATCH",
      cookie: memberCookie,
      body: { displayName: "Desk Trader" },
    });
    assert.equal(rejectedProfileWithoutCsrf.status, 403);

    const updatedProfile = await request(origin, "/api/auth/profile", {
      method: "PATCH",
      cookie: memberCookie,
      csrf: memberCsrf,
      body: { displayName: "Desk Trader", username: "cannot-change", role: "admin" },
    });
    assert.equal(updatedProfile.status, 200);
    assert.equal(updatedProfile.body.user.displayName, "Desk Trader");
    assert.equal(updatedProfile.body.user.username, "member");
    assert.equal(updatedProfile.body.user.id, member.body.user.id);
    assert.equal(updatedProfile.body.user.role, "member");

    const refreshedMemberSession = await request(origin, "/api/auth/session", { cookie: memberCookie });
    assert.equal(refreshedMemberSession.body.user.displayName, "Desk Trader");

    const memberProject = await request(origin, "/api/projects", {
      method: "POST",
      cookie: memberCookie,
      csrf: memberCsrf,
      body: { name: "Member project" },
    });
    assert.equal(memberProject.status, 201);
    assert.equal(dirname(memberProject.body.project.path), await realpath(workspace));

    const rejectedMemberPath = join(temporaryRoot, "member-must-not-create-here");
    const memberOutsideProject = await request(origin, "/api/projects", {
      method: "POST",
      cookie: memberCookie,
      csrf: memberCsrf,
      body: { name: "Outside member project", path: rejectedMemberPath },
    });
    assert.equal(memberOutsideProject.status, 403);
    await assert.rejects(readFile(rejectedMemberPath), /ENOENT/);

    const memberUsers = await request(origin, "/api/users", { cookie: memberCookie });
    assert.equal(memberUsers.status, 403);
    const memberAdminDownload = await request(origin, `/api/admin/files/download?path=${encodeURIComponent(outsideFile)}`, { cookie: memberCookie });
    assert.equal(memberAdminDownload.status, 403);

    const sharePath = `/api/projects/${createdProject.body.project.id}/members`;
    const sharingThread = await request(origin, "/api/threads", { method: "POST", cookie: adminCookie, csrf: adminCsrf, body: { projectId: createdProject.body.project.id, firstMessage: "Shared project test" } });
    assert.equal(sharingThread.status, 201);
    const sharingId = sharingThread.body.thread.id;
    assert.equal((await request(origin, `/api/threads/${threadId}?projectId=${createdProject.body.project.id}`, { cookie: memberCookie })).status, 404);
    const grant = await request(origin, sharePath, { method: "PUT", cookie: adminCookie, csrf: adminCsrf, body: { memberIds: [memberLogin.body.user.id] } });
    assert.equal(grant.status, 200);
    const sharedProjects = await request(origin, "/api/projects", { cookie: memberCookie });
    assert.ok(sharedProjects.body.projects.some((project) => project.id === createdProject.body.project.id));
    const sharedRead = await request(origin, `/api/threads/${sharingId}?projectId=${createdProject.body.project.id}`, { cookie: memberCookie });
    assert.equal(sharedRead.status, 200, JSON.stringify(sharedRead.body));
    const sharedEvents = await fetch(`${origin}/api/events?scope=workspace&threadId=${sharingId}`, { headers: { Cookie: memberCookie } });
    const sharedInitial = await readSseUntil(sharedEvents.body.getReader(), (contents) => contents.includes('"method":"workspace/state"'));
    assert.match(sharedInitial, /workspace\/state/);
    const liveShared = await fetch(`${origin}/api/events?scope=workspace&threadId=${sharingId}`, { headers: { Cookie: memberCookie } });
    const memberQueued = await request(origin, `/api/threads/${sharingId}/queue`, { method: "POST", cookie: memberCookie, csrf: memberCsrf, body: { projectId: createdProject.body.project.id, text: "Shared member queued message" } });
    assert.equal(memberQueued.status, 202);
    const memberQueueEvents = await readSseUntil(liveShared.body.getReader(), (contents) => contents.includes('"method":"queue/updated"'));
    assert.match(memberQueueEvents, /queue\/updated/);
    const revokeStream = await fetch(`${origin}/api/events?scope=workspace&threadId=${sharingId}`, { headers: { Cookie: memberCookie } });
    const revokeReader = revokeStream.body.getReader();
    await readWithTimeout(revokeReader, 1000);
    assert.equal((await request(origin, sharePath, { method: "PUT", cookie: memberCookie, csrf: memberCsrf, body: { memberIds: [] } })).status, 403);
    assert.equal((await request(origin, `/api/projects/${createdProject.body.project.id}`, { method: "DELETE", cookie: memberCookie, csrf: memberCsrf })).status, 403);
    assert.equal((await request(origin, sharePath, { method: "PUT", cookie: adminCookie, csrf: adminCsrf, body: { memberIds: [] } })).status, 200);
    let revokedClosed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if ((await readWithTimeout(revokeReader, 1000)).done) { revokedClosed = true; break; }
    }
    assert.equal(revokedClosed, true);
    assert.equal((await request(origin, `/api/threads/${threadId}?projectId=${createdProject.body.project.id}`, { cookie: memberCookie })).status, 404);
    assert.equal((await fetch(`${origin}/api/events?scope=workspace&threadId=${sharingId}`, { headers: { Cookie: memberCookie } })).status, 404);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(origin, "/api/auth/login", {
        method: "POST",
        body: { username: "missing-user", password: "wrong-password" },
      });
      assert.equal(failed.status, 401);
    }
    const blocked = await request(origin, "/api/auth/login", {
      method: "POST",
      body: { username: "missing-user", password: "wrong-password" },
    });
    assert.equal(blocked.status, 429);

    const persistedState = await readFile(join(data, "workspace-state.json"), "utf8");
    assert.doesNotMatch(persistedState, /admin-pass-123|member-pass-123/);
  } finally {
    child.kill("SIGTERM");
    const exited = await Promise.race([
      onceExit(child).then(() => true),
      new Promise((resolveWait) => setTimeout(() => resolveWait(false), 1_000)),
    ]);
    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
      await onceExit(child);
    }
    assert.equal(resolve(temporaryRoot).startsWith(resolve(tmpdir())), true);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function request(origin, path, { method = "GET", body, cookie, csrf, origin: requestOrigin = origin } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers["X-Codex-CSRF-Token"] = csrf;
  if (requestOrigin) headers.Origin = requestOrigin;
  const response = await fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { response, status: response.status, body: text ? JSON.parse(text) : null };
}

async function waitForActiveThread(origin, threadId, projectId, cookie) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await request(origin, `/api/threads/${threadId}?projectId=${projectId}`, { cookie });
    if (result.status === 200 && result.body.runtime?.activeTurnId) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error("Timed out waiting for the fake Codex turn to become active.");
}

async function readSseUntil(reader, predicate) {
  const decoder = new TextDecoder();
  const deadline = Date.now() + 8_000;
  let contents = "";
  try {
    while (Date.now() < deadline) {
      const remaining = Math.max(1, deadline - Date.now());
      const result = await readWithTimeout(reader, remaining);
      if (result.done) break;
      contents += decoder.decode(result.value, { stream: true });
      if (predicate(contents)) return contents;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error(`Expected SSE events were not received: ${contents}`);
}

async function readWithTimeout(reader, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out reading SSE events.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function sessionCookie(response) {
  const value = response.headers.get("set-cookie") || "";
  const cookie = value.split(";", 1)[0];
  assert.match(cookie, /^codex_workspace_session_[0-9a-f]{12}=/);
  return cookie;
}

async function availablePort() {
  const probe = createServer();
  await new Promise((resolveListen, rejectListen) => probe.once("error", rejectListen).listen(0, "127.0.0.1", resolveListen));
  const port = probe.address().port;
  await new Promise((resolveClose, rejectClose) => probe.close((error) => error ? rejectClose(error) : resolveClose()));
  return port;
}

async function waitForHealth(origin, child, readErrors) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited early: ${readErrors()}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for test server health: ${readErrors()}`);
}

function onceExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once("exit", resolveExit));
}
