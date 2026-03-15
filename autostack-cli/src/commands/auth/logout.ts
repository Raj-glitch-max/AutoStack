import { Command } from 'commander';
import { clearCredentials } from '../../lib/auth';
import chalk from 'chalk';

export const logoutCommand = new Command('logout')
  .description('Log out of AutoStack and clear credentials')
  .action(() => {
    clearCredentials();
    console.log(chalk.green('✓ Successfully logged out.'));
  });
