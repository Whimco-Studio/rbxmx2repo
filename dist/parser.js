"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readProperty = readProperty;
exports.parseRbxmx = parseRbxmx;
exports.getItemProperties = getItemProperties;
const promises_1 = __importDefault(require("node:fs/promises"));
const fast_xml_parser_1 = require("fast-xml-parser");
const TEXT_NODE = "#text";
const parser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: TEXT_NODE,
    parseTagValue: false,
    parseAttributeValue: false
});
function normalizeToArray(value) {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
function readProperty(properties, propertyName) {
    for (const [typeName, value] of Object.entries(properties)) {
        if (typeName === "@_name") {
            continue;
        }
        const entries = normalizeToArray(value);
        for (const entry of entries) {
            if (!entry || typeof entry !== "object") {
                continue;
            }
            const name = entry["@_name"];
            if (name === propertyName) {
                const text = entry[TEXT_NODE];
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
function buildNode(item) {
    const className = String(item["@_class"] ?? "Folder");
    const properties = (item.Properties ?? {});
    const name = readProperty(properties, "Name") ?? className;
    const disabledValue = readProperty(properties, "Disabled");
    const disabled = disabledValue === "true";
    const source = readProperty(properties, "Source") ?? "";
    const node = {
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
    const childItems = normalizeToArray(item.Item);
    node.children = childItems.map((child) => buildNode(child));
    return node;
}
async function parseRbxmx(filePath) {
    const xml = await promises_1.default.readFile(filePath, "utf8");
    const parsed = parser.parse(xml);
    const rootTag = Object.keys(parsed)[0];
    const rootObject = parsed[rootTag];
    const rootAttributes = {};
    const rootExtras = {};
    for (const [key, value] of Object.entries(rootObject)) {
        if (key.startsWith("@_")) {
            rootAttributes[key] = String(value);
        }
        else if (key !== "Item") {
            rootExtras[key] = value;
        }
    }
    const items = normalizeToArray(rootObject.Item);
    nextId = 1;
    const rootNode = {
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
function getItemProperties(item) {
    return (item.Properties ?? {});
}
