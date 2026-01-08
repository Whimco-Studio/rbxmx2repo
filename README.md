# rbxmx2repo

Convert Roblox `.rbxmx` XML models into a clean, repo-based filesystem layout designed for Rojo-style workflows.

## Features

- Parses Roblox `.rbxmx` XML files.
- Traverses the Instance hierarchy and preserves folder structure.
- Extracts script sources:
  - `Script` → `.server.lua`
  - `LocalScript` → `.client.lua`
  - `ModuleScript` → `.lua`
- Auto-deduplicates filenames to avoid collisions.
- Generates `_manifest.json` with script metadata.
- Optional export of non-script models into `assets/`.

## Usage

```bash
rbxmx2repo input.rbxmx --out ./repo
```

### Local development run

```bash
npm run build
node dist/index.js input.rbxmx --out ./repo
```

### Global install

```bash
npm i -g .
rbxmx2repo input.rbxmx --out ./repo
```

### Homebrew

A Homebrew formula can install this package and expose `rbxmx2repo` on PATH via the `bin` entry in `package.json`.

### Flags

- `--scripts-only` (default) Only export script sources into `src/`.
- `--keep-models` Export non-script subtrees into `assets/` as `.rbxmx` files.
- `--plain-lua` Output `.lua` for all scripts (disable Rojo-style extensions).

## Output Structure

```
repo/
  src/
    <Instance folders>/
      MyScript.server.lua
      MyModule.lua
  assets/            # only if --keep-models
  _manifest.json
```

## Development

```bash
npm install
npm run build
```

## Manifest Format

`_manifest.json` is an array of entries with the following shape:

```json
{
  "name": "MyScript",
  "className": "Script",
  "serviceRoot": "ServerScriptService",
  "outputPath": "src/Folder/MyScript.server.lua",
  "disabled": false
}
```

## Notes

This tool is intentionally modular and TypeScript-based so it can be extended later for Rojo + RobloxTS compatibility.
