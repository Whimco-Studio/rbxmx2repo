import fs from "node:fs/promises";
import path from "node:path";
import { XMLBuilder } from "fast-xml-parser";
import { ExportOptions, InstanceNode, ManifestEntry, ParsedRbxmx, ScriptClass } from "./types";
import { getUniqueFileName, getUniqueSegment, sanitizeName, toPosixPath } from "./fs-utils";

const SCRIPT_CLASSES: ScriptClass[] = ["Script", "LocalScript", "ModuleScript"];
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

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  format: true
});

function isScriptClass(className: string): className is ScriptClass {
  return SCRIPT_CLASSES.includes(className as ScriptClass);
}

function getScriptExtension(className: ScriptClass, plainLua: boolean): string {
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

function getInitFileName(className: ScriptClass, plainLua: boolean): string {
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

function collectScriptNodes(root: InstanceNode): InstanceNode[] {
  const scripts: InstanceNode[] = [];
  const stack: InstanceNode[] = [root];
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

function assignPathSegments(
  node: InstanceNode,
  parentPath: string,
  usedSegments: Map<string, Set<string>>
): void {
  for (const child of node.children) {
    const isServiceRoot = node.className === "ROOT" && SERVICE_ROOTS.includes(child.className);
    const baseName = sanitizeName(isServiceRoot ? child.className : child.name || child.className);
    const segment = getUniqueSegment(usedSegments, parentPath || ".", baseName);
    child.pathSegment = segment;
    const childPath = path.posix.join(parentPath, segment);
    assignPathSegments(child, childPath, usedSegments);
  }
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}


function getPathSegments(node: InstanceNode): string[] {
  const segments: string[] = [];
  let current: InstanceNode | undefined = node;
  while (current && current.className !== "ROOT") {
    if (current.pathSegment) {
      segments.unshift(current.pathSegment);
    }
    current = findParent(current);
  }
  return segments;
}

const parentMap = new Map<number, InstanceNode>();

function mapParents(node: InstanceNode): void {
  for (const child of node.children) {
    parentMap.set(child.id, node);
    mapParents(child);
  }
}

function findParent(node: InstanceNode): InstanceNode | undefined {
  return parentMap.get(node.id);
}

function getServiceRoot(node: InstanceNode): string {
  let current: InstanceNode | undefined = node;
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

function getOutputDir(outDir: string, segments: string[]): string {
  return path.join(outDir, "src", ...segments);
}

function buildAssetXml(parsed: ParsedRbxmx, itemRecord: Record<string, unknown>): string {
  const rootTemplate: Record<string, unknown> = {
    ...parsed.rootExtras,
    ...parsed.rootAttributes
  };
  const rootObject: Record<string, unknown> = {
    ...rootTemplate,
    Item: itemRecord
  };
  const xmlObject = {
    [parsed.rootTag]: rootObject
  };
  return builder.build(xmlObject);
}

async function exportScript(
  script: InstanceNode,
  outDir: string,
  usedSegments: Map<string, Set<string>>,
  usedFiles: Map<string, Set<string>>,
  manifest: ManifestEntry[],
  plainLua: boolean,
  processedScripts: Set<number>,
  parentScriptFolderPath?: string[]
): Promise<void> {
  // Skip if already processed as a child of another script
  if (processedScripts.has(script.id)) {
    return;
  }

  const source = String(script.properties.Source ?? "");
  const baseName = sanitizeName(script.name || script.className);

  // Check if script has children (any children, not just scripts)
  const hasChildren = script.children.length > 0;

  let outputDir: string;
  let outputFile: string;
  let relPath: string;
  let scriptFolderSegments: string[];

  if (parentScriptFolderPath) {
    // This is a child script of a script with children - use parent's folder path
    scriptFolderSegments = parentScriptFolderPath;
    const dirKey = scriptFolderSegments.join("/") || ".";
    
    if (hasChildren) {
      // Child script also has children - create nested folder
      const folderName = getUniqueSegment(usedSegments, dirKey, baseName);
      scriptFolderSegments = [...parentScriptFolderPath, folderName];
      outputDir = getOutputDir(outDir, scriptFolderSegments);
      const initFileName = getInitFileName(script.className as ScriptClass, plainLua);
      outputFile = path.join(outputDir, initFileName);
      relPath = toPosixPath(path.join("src", ...scriptFolderSegments, initFileName));
    } else {
      // Child script without children - export as normal file in parent's folder
      const extension = getScriptExtension(script.className as ScriptClass, plainLua);
      const fileName = getUniqueFileName(usedFiles, dirKey, baseName, extension);
      outputDir = getOutputDir(outDir, scriptFolderSegments);
      outputFile = path.join(outputDir, fileName);
      relPath = toPosixPath(path.join("src", ...scriptFolderSegments, fileName));
    }
  } else {
    // This is a top-level script (not a child of another script)
    const segments = getPathSegments(script).slice(0, -1);
    const dirKey = segments.join("/") || ".";

    if (hasChildren) {
      // Script with children: create folder with init.{ext} file
      const folderName = getUniqueSegment(usedSegments, dirKey, baseName);
      scriptFolderSegments = [...segments, folderName];
      outputDir = getOutputDir(outDir, scriptFolderSegments);
      const initFileName = getInitFileName(script.className as ScriptClass, plainLua);
      outputFile = path.join(outputDir, initFileName);
      relPath = toPosixPath(path.join("src", ...scriptFolderSegments, initFileName));
    } else {
      // Script without children: export as normal file
      const extension = getScriptExtension(script.className as ScriptClass, plainLua);
      const fileName = getUniqueFileName(usedFiles, dirKey, baseName, extension);
      outputDir = getOutputDir(outDir, segments);
      outputFile = path.join(outputDir, fileName);
      relPath = toPosixPath(path.join("src", ...segments, fileName));
      scriptFolderSegments = segments;
    }
  }

  await ensureDir(outputFile);
  await fs.writeFile(outputFile, source, "utf8");

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

export async function exportRbxmx(parsed: ParsedRbxmx, options: ExportOptions): Promise<void> {
  const { outDir, keepModels, plainLua } = options;
  const usedSegments = new Map<string, Set<string>>();
  const usedFiles = new Map<string, Set<string>>();
  const manifest: ManifestEntry[] = [];
  const processedScripts = new Set<number>();

  parentMap.clear();
  mapParents(parsed.rootNode);
  assignPathSegments(parsed.rootNode, "", usedSegments);

  const scripts = collectScriptNodes(parsed.rootNode);
  for (const script of scripts) {
    await exportScript(script, outDir, usedSegments, usedFiles, manifest, plainLua, processedScripts, undefined);
  }

  if (keepModels) {
    const assetsDir = path.join(outDir, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const assetNames = new Map<string, Set<string>>();

    const serviceTargets = new Set(["Workspace", "ServerStorage", "ReplicatedStorage"]);
    for (const serviceNode of parsed.rootNode.children) {
      if (!serviceTargets.has(serviceNode.className)) {
        continue;
      }
      for (const child of serviceNode.children) {
        if (isScriptClass(child.className) || !child.rawItem) {
          continue;
        }
        const itemName = sanitizeName(child.name || child.className);
        const uniqueName = getUniqueSegment(assetNames, ".", itemName);
        const assetPath = path.join(assetsDir, `${uniqueName}.rbxmx`);
        const xml = buildAssetXml(parsed, child.rawItem);
        await fs.writeFile(assetPath, xml, "utf8");
      }
    }
  }

  const manifestPath = path.join(outDir, "_manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}
