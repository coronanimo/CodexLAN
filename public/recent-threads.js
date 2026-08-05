import { timestampMilliseconds } from "./elapsed-time.js";

export function recentThreadEntries(projects, threadsByProject, limit = 6) {
  const entries = [];
  for (const project of projects || []) {
    for (const thread of threadsByProject.get(project.id) || []) {
      entries.push({ project, thread });
    }
  }
  entries.sort((left, right) => {
    const rightTime = timestampMilliseconds(right.thread.updatedAt) || 0;
    const leftTime = timestampMilliseconds(left.thread.updatedAt) || 0;
    return rightTime - leftTime;
  });
  return entries.slice(0, Math.max(0, limit));
}
