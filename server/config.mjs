import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { networkInterfaces } from "node:os";

const CONFIG_FILE = join("config", "codexlan.json");
const CONFIG_KEYS = new Set([
  "$schema",
  "port",
  "host",
  "workspaceRoot",
  "dataRoot",
  "codexBin",
]);

export async function loadServerConfig({ appRoot, env = process.env } = {}) {
  if (!appRoot) throw new Error("loadServerConfig requires appRoot.");
  const explicitConfig = env.CODEX_CONFIG;
  const configDisabled = explicitConfig === "0" || (env.NODE_ENV === "test" && explicitConfig === undefined);
  const configPath = configDisabled ? null : resolve(appRoot, explicitConfig || CONFIG_FILE);
  const configLoaded = Boolean(configPath && existsSync(configPath));
  const fileConfig = configLoaded ? await readConfigFile(configPath) : {};
  if (explicitConfig && explicitConfig !== "0" && !existsSync(configPath)) {
    throw new Error(`CODEX_CONFIG points to a missing file: ${configPath}`);
  }
  validateConfigKeys(fileConfig, configPath);

  const configBase = configPath ? dirname(configPath) : appRoot;
  const port = portSetting(setting(fileConfig, env, "port", "CODEX_WEB_PORT", 8688), "port", 1);
  let host = hostSetting(setting(fileConfig, env, "host", "CODEX_WEB_HOST", "auto"));
  if (!Object.hasOwn(fileConfig, "host") && env.CODEX_LAN_ENABLED === "0") host = "127.0.0.1";
  const dataRootSetting = setting(fileConfig, env, "dataRoot", "CODEX_WEB_DATA_DIR", join(appRoot, "data"));
  const dataRoot = pathSetting(dataRootSetting, "dataRoot", configBase, appRoot);
  const workspaceRootSetting = setting(fileConfig, env, "workspaceRoot", "CODEX_WORKDIR", join(dataRoot, "projects"));
  const codexBin = optionalStringSetting(setting(fileConfig, env, "codexBin", "CODEX_BIN", null), "codexBin");

  return {
    configPath: configLoaded ? configPath : null,
    port,
    host,
    workspaceRoot: pathSetting(workspaceRootSetting, "workspaceRoot", configBase, appRoot),
    workspaceRootConfigured: workspaceRootSetting.configured,
    dataRoot,
    codexBin,
  };
}

export function selectListenerAddress(requestedHost) {
  if (requestedHost) return requestedHost;
  const addresses = Object.values(networkInterfaces()).flat()
    .filter((address) => address?.family === "IPv4" && !address.internal && isPrivateIpv4(address.address));
  const preferred = addresses.find((address) => address.address.startsWith("192.168."))
    || addresses.find((address) => address.address.startsWith("10."))
    || addresses[0];
  return preferred?.address || null;
}

export function isLoopbackIpv4(address) {
  const octets = ipv4Octets(address);
  return octets.length === 4 && octets[0] === 127;
}

export function isPrivateIpv4(address) {
  const octets = ipv4Octets(address);
  if (octets.length !== 4) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

async function readConfigFile(configPath) {
  let contents;
  try {
    contents = await readFile(configPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${configPath}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${configPath} must contain one JSON object.`);
  }
  return parsed;
}

function validateConfigKeys(config, configPath) {
  const unknown = Object.keys(config).filter((key) => !CONFIG_KEYS.has(key));
  if (unknown.length) throw new Error(`Unknown setting in ${configPath}: ${unknown.join(", ")}`);
  if (Object.hasOwn(config, "$schema") && typeof config.$schema !== "string") {
    throw new Error(`$schema in ${configPath} must be a string.`);
  }
}

function setting(config, env, configName, environmentName, fallback) {
  if (Object.hasOwn(config, configName)) return { value: config[configName], configured: true, fromEnvironment: false };
  if (Object.hasOwn(env, environmentName) && env[environmentName] !== undefined) {
    return { value: env[environmentName], configured: true, fromEnvironment: true };
  }
  return { value: fallback, configured: false, fromEnvironment: false };
}

function portSetting(selected, name, minimum) {
  const value = selected.value;
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) {
    throw new Error(`${name} must be an integer from ${minimum} to 65535.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > 65535) {
    throw new Error(`${name} must be an integer from ${minimum} to 65535.`);
  }
  return parsed;
}

function hostSetting(selected) {
  const value = selected.value;
  if (value === null || value === "auto") return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("host must be \"auto\" or an IPv4 address.");
  return value.trim();
}

function optionalStringSetting(selected, name) {
  const value = selected.value;
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string or null.`);
  return value.trim();
}

function pathSetting(selected, name, configBase, appRoot) {
  const value = selected.value;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty path.`);
  if (isAbsolute(value)) return resolve(value);
  return resolve(selected.fromEnvironment ? appRoot : configBase, value);
}

function ipv4Octets(address) {
  const octets = typeof address === "string" ? address.split(".").map((part) => Number(part)) : [];
  return octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? octets : [];
}
