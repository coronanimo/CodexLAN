import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const installation = join(process.env.LOCALAPPDATA, 'Programs', 'CodexLAN');
const plan = JSON.parse(await readFile(join(installation, 'project-layout.json'), 'utf8'));
const config = JSON.parse(await readFile(join(plan.Home, 'config.json'), 'utf8'));
const db = new DatabaseSync(join(config.dataRoot, 'workspace-state.sqlite'), { readOnly: true });
const projects = db.prepare('SELECT value FROM projects ORDER BY position').all().map(({ value }) => JSON.parse(value));
db.close();
for (const entry of plan.Entries) {
  if (!existsSync(entry.Target)) throw new Error(`Migrated code directory is missing: ${entry.Target}`);
}
if (projects.some((project) => /^F:[\\/]GPTData[\\/]/i.test(project.path))) throw new Error('An active project still references the old F-drive layout.');
for (const path of ['F:/QuantData/data_lake/metadata/health.json', 'F:/QuantData/models/Meta0/registry.json', 'F:/QuantData/archives/Meta0/project-artifacts-20261106']) {
  if (!existsSync(path)) throw new Error(`Protected quant-data location is missing: ${path}`);
}
console.log(JSON.stringify({ migratedCodeDirectories: plan.Entries.length, totalRegisteredProjects: projects.length, migratedDirectoriesStillRegistered: plan.Entries.filter((entry) => projects.some((project) => project.path.toLowerCase() === entry.Target.toLowerCase())).length, oldFDriveProjectPaths: 0, protectedQuantLocationsPresent: true }));
