#!/usr/bin/env node
import { runSnapshotExportCli } from './src/snapshot-export.mjs';

process.exitCode = await runSnapshotExportCli();
