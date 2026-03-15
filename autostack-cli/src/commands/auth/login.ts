import { Command } from 'commander';
import { apiClient } from '../../lib/api';
import { saveCredentials } from '../../lib/auth';
import chalk from 'chalk';

export const loginCommand = new Command('login')
  .description('Log in to AutoStack via device code')
  .action(async () => {
    try {
      console.log('Initiating login...');
      
      const { device_code, user_code, verification_uri, interval, expires_in } = 
        await apiClient('/cli-auth-start', { method: 'POST' });

      console.log(`\n╔${'═'.repeat(42)}╗`);
      console.log(`║  Open: ${chalk.cyan(verification_uri.padEnd(34))}║`);
      console.log(`║  Enter code: ${chalk.bold.green(user_code.padEnd(28))}║`);
      console.log(`╚${'═'.repeat(42)}╝\n`);
      console.log('Waiting for authentication...');

      const start = Date.now();
      
      while (Date.now() - start < expires_in * 1000) {
        await new Promise(r => setTimeout(r, interval * 1000));
        
        try {
          const pollRes = await apiClient('/cli-auth-poll', {
            method: 'POST',
            body: JSON.stringify({ device_code })
          });

          if (pollRes.status === 'authorized') {
            saveCredentials({
              access_token: pollRes.access_token,
              refresh_token: pollRes.refresh_token
            });
            console.log(chalk.green('✓ Logged in successfully.'));
            return;
          }
        } catch (e: any) {
          if (e.message !== 'authorization_pending') {
            throw e;
          }
        }
      }

      console.log(chalk.red('✗ Login timed out. Please try again.'));

    } catch (e: any) {
      console.error(chalk.red(`✗ Error: ${e.message}`));
      process.exit(1);
    }
  });
