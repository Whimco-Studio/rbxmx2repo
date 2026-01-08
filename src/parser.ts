import fs from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import { InstanceNode, ParsedRbxmx } from "./types";

const TEXT_NODE = "#text";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: TEXT_NODE,
  parseTagValue: false,
  parseAttributeValue: false
});

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function readProperty(properties: Record<string, unknown>, propertyName: string): string | undefined {
  for (const [typeName, value] of Object.entries(properties)) {
    if (typeName === "@_name") {
      continue;
    }
    const entries = normalizeToArray(value as Record<string, unknown> | Record<string, unknown>[]);
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const name = (entry as Record<string, unknown>)["@_name"];
      if (name === propertyName) {
        const text = (entry as Record<string, unknown>)[TEXT_NODE];
        if (typeof text === "string") {
          return text;
        }
        if (typeof text === "number") {
          return String(text);
        }
      }
    }
  }
  return undefined;
}

let nextId = 1;

function buildNode(item: Record<string, unknown>): InstanceNode {
  const className = String(item["@_class"] ?? "Folder");
  const properties = (item.Properties ?? {}) as Record<string, unknown>;
  const name = readProperty(properties, "Name") ?? className;
  const disabledValue = readProperty(properties, "Disabled");
  const disabled = disabledValue === "true";
  const source = readProperty(properties, "Source") ?? "";
  const node: InstanceNode = {
    id: nextId,
    name,
    className,
    properties: {
      Name: name,
      Disabled: disabled,
      Source: source
    },
    rawItem: item,
    children: []
  };
  nextId += 1;

  const childItems = normalizeToArray(item.Item as Record<string, unknown> | Record<string, unknown>[]);
  node.children = childItems.map((child) => buildNode(child));

  return node;
}

export async function parseRbxmx(filePath: string): Promise<ParsedRbxmx> {
  const xml = await fs.readFile(filePath, "utf8");
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rootTag = Object.keys(parsed)[0];
  const rootObject = parsed[rootTag] as Record<string, unknown>;
  const rootAttributes: Record<string, string> = {};
  const rootExtras: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rootObject)) {
    if (key.startsWith("@_")) {
      rootAttributes[key] = String(value);
    } else if (key !== "Item") {
      rootExtras[key] = value;
    }
  }

  const items = normalizeToArray(rootObject.Item as Record<string, unknown> | Record<string, unknown>[]);
  nextId = 1;
  const rootNode: InstanceNode = {
    id: 0,
    name: "ROOT",
    className: "ROOT",
    properties: {},
    rawItem: undefined,
    children: items.map((item) => buildNode(item))
  };

  return {
    rootTag,
    rootAttributes,
    rootExtras,
    rootItems: items,
    rootNode
  };
}

export function getItemProperties(item: Record<string, unknown>): Record<string, unknown> {
  return (item.Properties ?? {}) as Record<string, unknown>;
}
