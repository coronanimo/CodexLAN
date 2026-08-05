import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const ignoredTraversalDirectories = new Set([".git", ".gradle", "build"]);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function filesUnder(directory) {
  const base = fileURLToPath(new URL(directory, root));
  if (!existsSync(base)) return [];
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredTraversalDirectories.has(entry.name)) visit(child);
        continue;
      }
      files.push(child);
    }
  };
  visit(base);
  return files;
}

test("keeps the Android namespace, application id, source path, and Java package aligned", () => {
  const build = read("android/app/build.gradle");
  assert.match(build, /namespace 'com\.hushiwei\.codexlan'/);
  assert.match(build, /applicationId 'com\.hushiwei\.codexlan'/);

  const activityPath = "android/app/src/main/java/com/hushiwei/codexlan/MainActivity.java";
  assert.equal(existsSync(new URL(activityPath, root)), true);
  assert.match(read(activityPath), /^package com\.hushiwei\.codexlan;/);
  assert.equal(existsSync(new URL("android/app/src/main/java/cn/shiwei/codexworkspace/MainActivity.java", root)), false);
});

test("classifies the current Android artifact as ABI-independent", () => {
  const nativeFiles = filesUnder("android/").filter((path) => extname(path).toLowerCase() === ".so");
  const jniSourceFiles = filesUnder("android/").filter((path) => path.split(/[\\/]/).includes("jniLibs"));
  assert.deepEqual(nativeFiles, []);
  assert.deepEqual(jniSourceFiles, []);
  assert.doesNotMatch(read("android/app/build.gradle"), /abiFilters|externalNativeBuild|\bndk\b/);
});

test("declares the selected MIT license", () => {
  assert.match(read("LICENSE"), /^MIT License/);
  assert.equal(JSON.parse(read("package.json")).license, "MIT");
});

test("keeps vendored KaTeX assets and license notices together", () => {
  assert.match(read("THIRD_PARTY_NOTICES.md"), /KaTeX 0\.16\.22/);
  assert.match(read("public/vendor/katex/LICENSE"), /^The MIT License/);
  for (const path of [
    "public/vendor/katex/katex.min.js",
    "public/vendor/katex/katex.min.css",
    "public/vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  ]) {
    assert.equal(existsSync(new URL(path, root)), true, `${path} must be present`);
  }
});

test("keeps clipboard captures out of the repository root", () => {
  const rootFiles = readdirSync(fileURLToPath(root), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => basename(entry.name));
  assert.deepEqual(rootFiles.filter((name) => /^clipboard-.*\.(png|jpe?g|webp)$/i.test(name)), []);
});

test("ignores runtime data, local tools, build output, binaries, and signing material", () => {
  const rules = new Set(read(".gitignore").split(/\r?\n/).filter(Boolean));
  for (const rule of [
    "data/", "logs/", "workspace/", ".tools/", ".codex-remote-attachments/", ".codexlan/",
    "generated-schema/", "dist/", "release/", "public/downloads/",
    "android/.gradle/", "android/app/build/", "android/local.properties",
    "*.apk", "*.aab", "*.jks", "*.keystore",
  ]) {
    assert.equal(rules.has(rule), true, `.gitignore must contain ${rule}`);
  }
});
