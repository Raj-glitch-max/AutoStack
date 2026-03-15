import { Command } from 'commander';
import { deployCommand } from './deploy';
import { redeployCommand } from './redeploy';
import { rollbackCommand } from './rollback';

export const attachDeployCommands = (program: Command) => {
  const deployGroup = new Command('deploy')
    .description('Manage deployments');
  
  deployGroup.addCommand(deployCommand);
  deployGroup.addCommand(redeployCommand);
  deployGroup.addCommand(rollbackCommand);
  
  program.addCommand(deployGroup);
};
