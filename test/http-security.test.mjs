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
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
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
      CODEX_TEST_SEED_CWD: join(workspace, "admin", "默认项目"),
      CODEX_TEST_SEED_COUNT: "205",
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
    assert.match(anonymous.response.headers.get("content-security-policy"), /style-src-elem 'self'; style-src-attr 'unsafe-inline'/);

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
    const threadId = createdThread.body.thread.id;
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

    const planSettings = await request(origin, `/api/threads/${threadId}`, {
      method: "PATCH",
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { projectId: createdProject.body.project.id, settings: { collaborationMode: "plan" } },
    });
    assert.equal(planSettings.status, 200);
    assert.equal(planSettings.body.settings.collaborationMode, "plan");

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
    assert.deepEqual(Object.keys(accessOnly.body), ["accessedAt"]);
    const readsAfterAccessOnly = (await readFile(traceFile, "utf8")).split(/\r?\n/)
      .filter((line) => line.includes('"method":"thread/read"')).length;
    assert.equal(readsAfterAccessOnly, readsBeforeAccessOnly);

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
    const steerRequests = trace.filter((entry) => entry.method === "turn/steer");
    assert.equal(steerRequests.length, 2);
    assert.equal(steerRequests.find((entry) => entry.params.input[0].text === "direct guidance").params.clientUserMessageId, directGuidance.body.item.id);
    assert.equal(steerRequests.find((entry) => entry.params.input[0].text === queueItem.text).params.clientUserMessageId, queueItem.id);
    const startedTurn = trace.find((entry) => entry.method === "turn/start" && entry.params.threadId === threadId);
    assert.equal(startedTurn.params.clientUserMessageId, firstTask.body.item.id);
    assert.equal(startedTurn.params.collaborationMode.mode, "plan");
    assert.equal(startedTurn.params.collaborationMode.settings.model, "gpt-5.6-sol");

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
    assert.equal(dirname(memberProject.body.project.path), join(workspace, "member"));

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
