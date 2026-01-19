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
function getInitFileName(className, plainLua) {
    if (plainLua) {
        return "init.lua";
    }
    switch (className) {
        case "Script":
            return "init.server.lua";
        case "LocalScript":
            return "init.client.lua";
        case "ModuleScript":
            return "init.lua";
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
async function exportScript(script, outDir, usedSegments, usedFiles, manifest, plainLua, processedScripts, parentScriptFolderPath) {
    // Skip if already processed as a child of another script
    if (processedScripts.has(script.id)) {
        return;
    }
    const source = String(script.properties.Source ?? "");
    const baseName = (0, fs_utils_1.sanitizeName)(script.name || script.className);
    // Check if script has children (any children, not just scripts)
    const hasChildren = script.children.length > 0;
    let outputDir;
    let outputFile;
    let relPath;
    let scriptFolderSegments;
    if (parentScriptFolderPath) {
        // This is a child script of a script with children - use parent's folder path
        scriptFolderSegments = parentScriptFolderPath;
        const dirKey = scriptFolderSegments.join("/") || ".";
        if (hasChildren) {
            // Child script also has children - create nested folder
            const folderName = (0, fs_utils_1.getUniqueSegment)(usedSegments, dirKey, baseName);
            scriptFolderSegments = [...parentScriptFolderPath, folderName];
            outputDir = getOutputDir(outDir, scriptFolderSegments);
            const initFileName = getInitFileName(script.className, plainLua);
            outputFile = node_path_1.default.join(outputDir, initFileName);
            relPath = (0, fs_utils_1.toPosixPath)(node_path_1.default.join("src", ...scriptFolderSegments, initFileName));
        }
        else {
            // Child script without children - export as normal file in parent's folder
            const extension = getScriptExtension(script.className, plainLua);
            const fileName = (0, fs_utils_1.getUniqueFileName)(usedFiles, dirKey, baseName, extension);
            outputDir = getOutputDir(outDir, scriptFolderSegments);
            outputFile = node_path_1.default.join(outputDir, fileName);
            relPath = (0, fs_utils_1.toPosixPath)(node_path_1.default.join("src", ...scriptFolderSegments, fileName));
        }
    }
    else {
        // This is a top-level script (not a child of another script)
        const segments = getPathSegments(script).slice(0, -1);
        const dirKey = segments.join("/") || ".";
        if (hasChildren) {
            // Script with children: create folder with init.{ext} file
            const folderName = (0, fs_utils_1.getUniqueSegment)(usedSegments, dirKey, baseName);
            scriptFolderSegments = [...segments, folderName];
            outputDir = getOutputDir(outDir, scriptFolderSegments);
            const initFileName = getInitFileName(script.className, plainLua);
            outputFile = node_path_1.default.join(outputDir, initFileName);
            relPath = (0, fs_utils_1.toPosixPath)(node_path_1.default.join("src", ...scriptFolderSegments, initFileName));
        }
        else {
            // Script without children: export as normal file
            const extension = getScriptExtension(script.className, plainLua);
            const fileName = (0, fs_utils_1.getUniqueFileName)(usedFiles, dirKey, baseName, extension);
            outputDir = getOutputDir(outDir, segments);
            outputFile = node_path_1.default.join(outputDir, fileName);
            relPath = (0, fs_utils_1.toPosixPath)(node_path_1.default.join("src", ...segments, fileName));
            scriptFolderSegments = segments;
        }
    }
    await ensureDir(outputFile);
    await promises_1.default.writeFile(outputFile, source, "utf8");
    manifest.push({
        name: script.name,
        className: script.className,
        serviceRoot: getServiceRoot(script),
        outputPath: relPath,
        disabled: Boolean(script.properties.Disabled)
    });
    // Mark this script as processed
    processedScripts.add(script.id);
    // If script has children, process them recursively
    if (hasChildren) {
        for (const child of script.children) {
            if (isScriptClass(child.className)) {
                // Process child script with parent's folder path
                await exportScript(child, outDir, usedSegments, usedFiles, manifest, plainLua, processedScripts, scriptFolderSegments);
            }
            // Non-script children are not exported (only scripts are exported)
        }
    }
}
async function exportRbxmx(parsed, options) {
    const { outDir, keepModels, plainLua } = options;
    const usedSegments = new Map();
    const usedFiles = new Map();
    const manifest = [];
    const processedScripts = new Set();
    parentMap.clear();
    mapParents(parsed.rootNode);
    assignPathSegments(parsed.rootNode, "", usedSegments);
    const scripts = collectScriptNodes(parsed.rootNode);
    for (const script of scripts) {
        await exportScript(script, outDir, usedSegments, usedFiles, manifest, plainLua, processedScripts, undefined);
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
