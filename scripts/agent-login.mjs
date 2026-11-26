import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AGENT_HOME } from './agent-install.mjs';

const args = process.argv.slice(2);
const codex = process.env.TEMPO_CODEX_BIN || 'codex';

console.log(`Вход в Codex для агента Tempo.\nКаталог: ${AGENT_HOME}\n`);

const child = spawn(codex, ['login', ...args], {
  stdio: 'inherit',
  env: { ...process.env, CODEX_HOME: AGENT_HOME },
});

child.on('error', (error) => {
  console.error(`Не нашёл codex (${codex}): ${error.message}`);
  console.error('Поставьте Codex CLI или укажите путь: TEMPO_CODEX_BIN=/путь/к/codex npm run agent:login');
  process.exit(1);
});

child.on('exit', (code) => {
  const ok = existsSync(path.join(AGENT_HOME, 'auth.json'));
  if (ok) console.log('\nГотово: агент авторизован. Панель Tempo подхватит это сама.');
  process.exit(ok ? 0 : code || 1);
});
