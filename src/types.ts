export type ScriptClass = "Script" | "LocalScript" | "ModuleScript";

export interface InstanceNode {
  id: number;
  name: string;
  className: string;
  properties: Record<string, string | boolean | undefined>;
  rawItem?: Record<string, unknown>;
  children: InstanceNode[];
  pathSegment?: string;
}

export interface ParsedRbxmx {
  rootTag: string;
  rootAttributes: Record<string, string>;
  rootExtras: Record<string, unknown>;
  rootItems: unknown[];
  rootNode: InstanceNode;
}

export interface ManifestEntry {
  name: string;
  className: string;
  serviceRoot: string;
  outputPath: string;
  disabled: boolean;
}

export interface ExportOptions {
  outDir: string;
  keepModels: boolean;
  plainLua: boolean;
}
