import { resolve } from 'node:path';

const metrics = [
  ['lines', 'LF', 'LH', 95],
  ['branches', 'BRF', 'BRH', 90],
  ['functions', 'FNF', 'FNH', 95],
] as const;

/** Check every source file, so untouched modules cannot disappear from the denominator. */
export function checkCoverage(lcov: string, sources: string[]): string {
  const records = new Map<string, Record<string, number>>();
  for (const record of lcov.split('end_of_record')) {
    const file = /^SF:(.+)$/m.exec(record)?.[1];
    if (!file) continue;
    const path = resolve(file);
    if (records.has(path)) throw new Error(`Duplicate coverage: ${path}`);
    const counts: Record<string, number> = {};
    for (const line of record.split('\n')) {
      const match = /^(LF|LH|BRF|BRH|FNF|FNH):(\d+)$/.exec(line);
      if (match) counts[match[1]] = Number(match[2]);
    }
    records.set(path, counts);
  }
  if (!sources.length) throw new Error('No source files found');
  const totals: Record<string, number> = {};
  const verify = (label: string, counts: Record<string, number>) => {
    for (const [metric, found, hit, minimum] of metrics) {
      const total = counts[found];
      const covered = counts[hit];
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(covered) || covered > total) {
        throw new Error(`Invalid ${metric} coverage: ${label}`);
      }
      if (total && covered * 100 < minimum * total) {
        throw new Error(
          `${label}: ${metric} ${((covered / total) * 100).toFixed(2)}% < ${minimum}%`,
        );
      }
    }
  };
  for (const file of sources) {
    const counts = records.get(resolve(file));
    if (!counts) throw new Error(`Missing coverage: ${file}`);
    verify(file, counts);
    for (const key of metrics.flatMap(([, found, hit]) => [found, hit])) {
      totals[key] = (totals[key] ?? 0) + counts[key];
    }
  }
  if (!totals.LF) throw new Error('Coverage report contains no executable lines');
  verify('All source files', totals);
  return metrics
    .map(
      ([metric, found, hit]) =>
        `${metric}: ${(totals[found] ? (totals[hit] / totals[found]) * 100 : 100).toFixed(2)}%`,
    )
    .join(', ');
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) files.push(...(await sourceFiles(path)));
    else if (entry.isFile && entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

if (import.meta.main) {
  console.log(
    checkCoverage(await Deno.readTextFile('coverage/lcov.info'), await sourceFiles('src')),
  );
}
