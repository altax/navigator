/**
 * Single source of truth for the workspace root directory.
 *
 * Resolution order:
 *   1. WORKSPACE_ROOT env var  (set explicitly in start-api.sh or CI)
 *   2. process.cwd()           (start-api.sh always `cd /home/runner/workspace`)
 *
 * Never hard-code "/home/runner/workspace" — this breaks if the project is
 * cloned or renamed.
 */
export const WORKSPACE: string = process.env.WORKSPACE_ROOT ?? process.cwd();
