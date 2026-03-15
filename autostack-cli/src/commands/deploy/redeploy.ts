import { Command } from 'commander';
import { apiClient } from '../../lib/api';
import chalk from 'chalk';

export const redeployCommand = new Command('redeploy')
  .description('Redeploy an environment')
  .argument('<env>', 'Environment to redeploy')
  .option('--json', 'Output JSON')
  .action(async (env, options) => {
    try {
      const res = await apiClient('/deploy-redeploy', { method: 'POST', body: JSON.stringify({ project_id: env }) });
      if (options.json) console.log(JSON.stringify(res));
      else console.log(chalk.green('✓ Redeployment triggered'));
    } catch (e: any) {
      if (options.json) console.log(JSON.stringify({ error: e.message }));
      else console.log(chalk.red(`✗ Error: ${e.message}`));
    }
  });
