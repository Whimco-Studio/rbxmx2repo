#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import minimist from "minimist";
import { parseRbxmx } from "./parser";
import { exportRbxmx } from "./exporter";

interface CliOptions {
  out: string;
  scriptsOnly: boolean;
  keepModels: boolean;
  plainLua: boolean;
}

function printUsage(): void {
  console.log("Usage: rbxmx2repo <input.rbxmx> --out <outputDir> [--scripts-only] [--keep-models] [--plain-lua]");
}

function parseArgs(argv: string[]): { input?: string; options: CliOptions } {
  const args = minimist(argv, {
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

async function ensureOutputDir(outDir: string): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
}

async function run(): Promise<void> {
  const { input, options } = parseArgs(process.argv.slice(2));
  if (!input || !options.out) {
    printUsage();
    process.exit(1);
  }

  // CLI: resolve paths and validate the input file before parsing.
  const inputPath = path.resolve(process.cwd(), input);
  const outDir = path.resolve(process.cwd(), options.out);

  const stat = await fs.stat(inputPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // CLI -> parser: parse the .rbxmx XML into an Instance tree.
  await ensureOutputDir(outDir);
  const parsed = await parseRbxmx(inputPath);

  // CLI -> exporter: write scripts/models to disk and emit the manifest.
  await exportRbxmx(parsed, {
    outDir,
    keepModels: options.keepModels || !options.scriptsOnly,
    plainLua: options.plainLua
  });
}

run().catch((error) => {
  console.error("rbxmx2repo failed:", error);
  process.exit(1);
});
