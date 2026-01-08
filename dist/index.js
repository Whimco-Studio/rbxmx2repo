#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const minimist_1 = __importDefault(require("minimist"));
const parser_1 = require("./parser");
const exporter_1 = require("./exporter");
function printUsage() {
    console.log("Usage: rbxmx2repo <input.rbxmx> --out <outputDir> [--scripts-only] [--keep-models] [--plain-lua]");
}
function parseArgs(argv) {
    const args = (0, minimist_1.default)(argv, {
        boolean: ["scripts-only", "keep-models", "plain-lua"],
        default: {
            "scripts-only": true,
            "keep-models": false,
            "plain-lua": false
        }
    });
    const input = args._[0];
    const out = args.out ? String(args.out) : "";
    return {
        input,
        options: {
            out,
            scriptsOnly: Boolean(args["scripts-only"]),
            keepModels: Boolean(args["keep-models"]),
            plainLua: Boolean(args["plain-lua"])
        }
    };
}
async function ensureOutputDir(outDir) {
    await promises_1.default.mkdir(outDir, { recursive: true });
}
async function run() {
    const { input, options } = parseArgs(process.argv.slice(2));
    if (!input || !options.out) {
        printUsage();
        process.exit(1);
    }
    // CLI: resolve paths and validate the input file before parsing.
    const inputPath = node_path_1.default.resolve(process.cwd(), input);
    const outDir = node_path_1.default.resolve(process.cwd(), options.out);
    const stat = await promises_1.default.stat(inputPath).catch(() => null);
    if (!stat || !stat.isFile()) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }
    // CLI -> parser: parse the .rbxmx XML into an Instance tree.
    await ensureOutputDir(outDir);
    const parsed = await (0, parser_1.parseRbxmx)(inputPath);
    // CLI -> exporter: write scripts/models to disk and emit the manifest.
    await (0, exporter_1.exportRbxmx)(parsed, {
        outDir,
        keepModels: options.keepModels || !options.scriptsOnly,
        plainLua: options.plainLua
    });
}
run().catch((error) => {
    console.error("rbxmx2repo failed:", error);
    process.exit(1);
});
