import { Command } from 'commander';
import { attachDeployCommands } from './commands/deploy';
// Other commands simplified for this phase demo:
const program = new Command();

program
  .name('autostack')
  .description('AutoStack Command Line Interface')
  .version('1.0.0')
  .option('--json', 'Output results in JSON format');

// Auth Commands
import { attachAuthCommands } from './commands/auth/index';
attachAuthCommands(program);

// Deploy Commands
attachDeployCommands(program);

// Scaffolding Env Commands
const envCmd = new Command('env').description('Manage environments');
envCmd.command('list').action(() => console.log('Env list stub'));
envCmd.command('status').action(() => console.log('Env status stub'));
envCmd.command('create').action(() => console.log('Env create stub'));
envCmd.command('delete').action(() => console.log('Env delete stub'));
program.addCommand(envCmd);

// Scaffolding Logs Commands
const logsCmd = new Command('logs').description('View logs').action(() => console.log('Logs streaming stub'));
program.addCommand(logsCmd);

// Scaffolding Vars Commands
const varsCmd = new Command('vars').description('Manage env vars');
varsCmd.command('list').action(() => console.log('Vars list stub'));
varsCmd.command('set').action(() => console.log('Vars set stub'));
program.addCommand(varsCmd);

// Scaffolding Ops Commands
program.command('cost').action(() => console.log('Cost metrics stub'));
program.command('incidents').action(() => console.log('Incidents list stub'));
program.command('db').action(() => console.log('Database management stub'));

program.parse(process.argv);
