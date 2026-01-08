"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeName = sanitizeName;
exports.getUniqueSegment = getUniqueSegment;
exports.getUniqueFileName = getUniqueFileName;
exports.toPosixPath = toPosixPath;
const node_path_1 = __importDefault(require("node:path"));
const INVALID_CHARS = /[\\/:*?"<>|]/g;
function sanitizeName(value) {
    const trimmed = value.trim().replace(INVALID_CHARS, "_");
    const cleaned = trimmed.replace(/\s+/g, " ");
    if (!cleaned) {
        return "Instance";
    }
    return cleaned;
}
function ensureSet(map, key) {
    const existing = map.get(key);
    if (existing) {
        return existing;
    }
    const created = new Set();
    map.set(key, created);
    return created;
}
function getUniqueSegment(map, dirKey, baseName) {
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
function getUniqueFileName(map, dirKey, baseName, extension) {
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
function toPosixPath(targetPath) {
    return targetPath.split(node_path_1.default.sep).join(node_path_1.default.posix.sep);
}
