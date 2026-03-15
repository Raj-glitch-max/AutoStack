import { Command } from 'commander';
import { getCredentials } from '../../lib/auth';
import * as jwt from 'jsonwebtoken';
import chalk from 'chalk';

export const whoamiCommand = new Command('whoami')
  .description('Show current authenticated user info')
  .action(() => {
    const creds = getCredentials();
    if (!creds || !creds.access_token) {
      console.log(chalk.yellow('Not logged in.'));
      process.exit(1);
    }

    try {
      const decoded: any = jwt.decode(creds.access_token);
      if (!decoded || !decoded.email) {
        console.log(chalk.red('Invalid token format.'));
        return;
      }
      console.log(`✓ Logged in as ${chalk.bold.cyan(decoded.email)}`);
    } catch (e) {
      console.log(chalk.red('Failed to parse token.'));
    }
  });
