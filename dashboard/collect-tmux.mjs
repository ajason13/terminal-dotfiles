#!/usr/bin/env node
import { runCollectorCli } from './src/collector-cli.mjs';

process.exitCode = await runCollectorCli();
