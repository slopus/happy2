#!/usr/bin/env -S node --import tsx

import { resolve } from "node:path";
import { buildPlugin } from "./build.js";
import { loadPluginConfig } from "./config.js";

const root = resolve(process.argv[2] ?? process.cwd());
const config = await loadPluginConfig(root);
const result = await buildPlugin({ ...config, root: config.root ?? root });
process.stdout.write(`Built ${result.manifest.shortName} at ${result.outputDirectory}\n`);
