import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

// A managed conversation may administer a separate instance. It must not stop
// the instance hosting it; unknown or overlapping instance roots fail closed.
export async function assertServiceTarget({ action, managed, callerDataRoot, targetDataRoot }) {
  if (!managed || !["stop", "restart", "handoff"].includes(action)) return;
  const refused = () => new Error(`Refusing service ${action} for the hosting or unidentified CodexLAN instance. Run this command from an external terminal.`);
  if (!callerDataRoot || !isAbsolute(callerDataRoot) || !targetDataRoot || !isAbsolute(targetDataRoot)) throw refused();
  let caller, target;
  try { [caller, target] = await Promise.all([realpath(callerDataRoot), realpath(targetDataRoot)]); }
  catch { throw refused(); }
  const contains = (parent, child) => { const path = relative(parent, child); return !path || path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path); };
  if (contains(caller, target) || contains(target, caller)) throw refused();
}
