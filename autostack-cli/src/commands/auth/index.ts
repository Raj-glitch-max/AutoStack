import { Command } from 'commander';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { whoamiCommand } from './whoami';

export const attachAuthCommands = (program: Command) => {
  const authCmd = new Command('auth')
    .description('Manage authentication state');

  authCmd.addCommand(loginCommand);
  authCmd.addCommand(logoutCommand);
  authCmd.addCommand(whoamiCommand);

  program.addCommand(authCmd);
};
