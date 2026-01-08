"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRbxmx = exportRbxmx;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const fast_xml_parser_1 = require("fast-xml-parser");
const fs_utils_1 = require("./fs-utils");
const SCRIPT_CLASSES = ["Script", "LocalScript", "ModuleScript"];
const SERVICE_ROOTS = [
    "Workspace",
    "ServerScriptService",
    "ServerStorage",
    "ReplicatedStorage",
    "StarterPlayer",
    "StarterGui",
    "StarterPack",
    "Lighting",
    "SoundService",
    "Players",
    "Teams",
    "TextChatService",
    "Chat"
];
const builder = new fast_xml_parser_1.XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true
});
function isScriptClass(className) {
    return SCRIPT_CLASSES.includes(className);
}
function getScriptExtension(className, plainLua) {
    if (plainLua) {
        return ".lua";
    }
    switch (className) {
        case "Script":
            return ".server.lua";
        case "LocalScript":
            return ".client.lua";
        case "ModuleScript":
            return ".lua";
    }
}
function collectScriptNodes(root) {
    const scripts = [];
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        if (isScriptClass(current.className)) {
            scripts.push(current);
        }
        stack.push(...current.children);
    }
    return scripts;
}
function assignPathSegments(node, parentPath, usedSegments) {
    for (const child of node.children) {
        const isServiceRoot = node.className === "ROOT" && SERVICE_ROOTS.includes(child.className);
        const baseName = (0, fs_utils_1.sanitizeName)(isServiceRoot ? child.className : child.name || child.className);
        const segment = (0, fs_utils_1.getUniqueSegment)(usedSegments, parentPath || ".", baseName);
        child.pathSegment = segment;
        const childPath = node_path_1.default.posix.join(parentPath, segment);
        assignPathSegments(child, childPath, usedSegments);
    }
}
async function ensureDir(filePath) {
    await promises_1.default.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
}
function getPathSegments(node) {
    const segments = [];
    let current = node;
    while (current && current.className !== "ROOT") {
        if (current.pathSegment) {
            segments.unshift(current.pathSegment);
        }
        current = findParent(current);
    }
    return segments;
}
const parentMap = new Map();
function mapParents(node) {
    for (const child of node.children) {
        parentMap.set(child.id, node);
        mapParents(child);
    }
}
function findParent(node) {
    return parentMap.get(node.id);
}
function getServiceRoot(node) {
    let current = node;
    let parent = findParent(node);
    while (parent && parent.className !== "ROOT") {
        current = parent;
        parent = findParent(parent);
    }
    if (!current) {
        return "ROOT";
    }
    if (SERVICE_ROOTS.includes(current.className)) {
        return current.className;
    }
    return current.name;
}
function getOutputDir(outDir, segments) {
    return node_path_1.default.join(outDir, "src", ...segments);
}
function buildAssetXml(parsed, itemRecord) {
    const rootTemplate = {
        ...parsed.rootExtras,
        ...parsed.rootAttributes
    };
    const rootObject = {
        ...rootTemplate,
        Item: itemRecord
    };
    const xmlObject = {
        [parsed.rootTag]: rootObject
    };
    return builder.build(xmlObject);
}
async function exportRbxmx(parsed, options) {
    const { outDir, keepModels, plainLua } = options;
    const usedSegments = new Map();
    const usedFiles = new Map();
    const manifest = [];
    parentMap.clear();
    mapParents(parsed.rootNode);
    assignPathSegments(parsed.rootNode, "", usedSegments);
    const scripts = collectScriptNodes(parsed.rootNode);
    for (const script of scripts) {
        const segments = getPathSegments(script).slice(0, -1);
        const dirKey = segments.join("/") || ".";
        const baseName = (0, fs_utils_1.sanitizeName)(script.name || script.className);
        const extension = getScriptExtension(script.className, plainLua);
        const fileName = (0, fs_utils_1.getUniqueFileName)(usedFiles, dirKey, baseName, extension);
        const outputDir = getOutputDir(outDir, segments);
        const outputFile = node_path_1.default.join(outputDir, fileName);
        const source = String(script.properties.Source ?? "");
        await ensureDir(outputFile);
        await promises_1.default.writeFile(outputFile, source, "utf8");
        const relPath = (0, fs_utils_1.toPosixPath)(node_path_1.default.join("src", ...segments, fileName));
        manifest.push({
            name: script.name,
            className: script.className,
            serviceRoot: getServiceRoot(script),
            outputPath: relPath,
            disabled: Boolean(script.properties.Disabled)
        });
    }
    if (keepModels) {
        const assetsDir = node_path_1.default.join(outDir, "assets");
        await promises_1.default.mkdir(assetsDir, { recursive: true });
        const assetNames = new Map();
        const serviceTargets = new Set(["Workspace", "ServerStorage", "ReplicatedStorage"]);
        for (const serviceNode of parsed.rootNode.children) {
            if (!serviceTargets.has(serviceNode.className)) {
                continue;
            }
            for (const child of serviceNode.children) {
                if (isScriptClass(child.className) || !child.rawItem) {
                    continue;
                }
                const itemName = (0, fs_utils_1.sanitizeName)(child.name || child.className);
                const uniqueName = (0, fs_utils_1.getUniqueSegment)(assetNames, ".", itemName);
                const assetPath = node_path_1.default.join(assetsDir, `${uniqueName}.rbxmx`);
                const xml = buildAssetXml(parsed, child.rawItem);
                await promises_1.default.writeFile(assetPath, xml, "utf8");
            }
        }
    }
    const manifestPath = node_path_1.default.join(outDir, "_manifest.json");
    await promises_1.default.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}
