import { Command } from 'commander';
import { apiClient } from '../../lib/api';
import chalk from 'chalk';

export const rollbackCommand = new Command('rollback')
  .description('Rollback an environment to previous SHA')
  .argument('<env>', 'Environment to rollback')
  .option('--json', 'Output JSON')
  .action(async (env, options) => {
    try {
      const res = await apiClient('/deploy-redeploy', { method: 'POST', body: JSON.stringify({ project_id: env, rollback: true }) });
      if (options.json) console.log(JSON.stringify(res));
      else console.log(chalk.green('✓ Rollback triggered'));
    } catch (e: any) {
      if (options.json) console.log(JSON.stringify({ error: e.message }));
      else console.log(chalk.red(`✗ Error: ${e.message}`));
    }
  });
