import path from "node:path";

const INVALID_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeName(value: string): string {
  const trimmed = value.trim().replace(INVALID_CHARS, "_");
  const cleaned = trimmed.replace(/\s+/g, " ");
  if (!cleaned) {
    return "Instance";
  }
  return cleaned;
}

function ensureSet(map: Map<string, Set<string>>, key: string): Set<string> {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  map.set(key, created);
  return created;
}

export function getUniqueSegment(
  map: Map<string, Set<string>>,
  dirKey: string,
  baseName: string
): string {
  const used = ensureSet(map, dirKey);
  let candidate = baseName;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${baseName}_${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

export function getUniqueFileName(
  map: Map<string, Set<string>>,
  dirKey: string,
  baseName: string,
  extension: string
): string {
  const used = ensureSet(map, dirKey);
  let candidate = `${baseName}${extension}`;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${baseName}_${counter}${extension}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

export function toPosixPath(targetPath: string): string {
  return targetPath.split(path.sep).join(path.posix.sep);
}
