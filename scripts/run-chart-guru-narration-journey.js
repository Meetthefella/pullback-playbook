const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const runner = path.join(root, 'scripts', 'run-playwright-fresh-port.js');

function parseArgs(argv){
  const args = [];
  let tickers = '';
  argv.forEach(arg => {
    if(typeof arg === 'string' && arg.startsWith('--tickers=')){
      tickers = arg.slice('--tickers='.length).trim();
      return;
    }
    args.push(arg);
  });
  return {args, tickers};
}

function main(){
  const {args, tickers} = parseArgs(process.argv.slice(2));
  const env = {
    ...process.env
  };
  if(tickers){
    env.PP_TICKERS = tickers;
  }
  const commandArgs = [
    runner,
    'test',
    'tests/ui/journeys/chart-guru-narration-journey.spec.js',
    ...args
  ];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd:root,
    env,
    stdio:'inherit'
  });
  if(result.error) throw result.error;
  process.exit(result.status == null ? 1 : result.status);
}

main();
