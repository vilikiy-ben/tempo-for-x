import { chmod, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extensionIdFor } from './_extid.mjs';

export const HOST_NAME = 'com.tempo.agent';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = homedir();

export const AGENT_HOME = process.env.TEMPO_CODEX_HOME || path.join(home, '.tempo', 'codex');

export const HOST_DIR = path.join(home, '.tempo', 'host');

function hostDirs() {
  const mac = {
    'Google Chrome': 'Google/Chrome',
    'Chrome Beta': 'Google/Chrome Beta',
    'Chrome Canary': 'Google/Chrome Canary',
    'Chrome for Testing': 'Google/Chrome for Testing',
    Chromium: 'Chromium',
    'Microsoft Edge': 'Microsoft Edge',
    Brave: 'BraveSoftware/Brave-Browser',
    Vivaldi: 'Vivaldi',
    Arc: 'Arc/User Data',
  };
  const linux = {
    'Google Chrome': '.config/google-chrome',
    Chromium: '.config/chromium',
    'Microsoft Edge': '.config/microsoft-edge',
    Brave: '.config/BraveSoftware/Brave-Browser',
  };
  const out = [];
  if (platform() === 'darwin') {
    const base = path.join(home, 'Library/Application Support');
    for (const [name, tail] of Object.entries(mac)) {
      out.push({ name, dir: path.join(base, tail, 'NativeMessagingHosts'), exists: existsSync(path.join(base, tail)) });
    }
  } else {
    for (const [name, tail] of Object.entries(linux)) {
      out.push({ name, dir: path.join(home, tail, 'NativeMessagingHosts'), exists: existsSync(path.join(home, tail)) });
    }
  }
  return out;
}

const sh = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

async function installHost() {
  const nodeBin = await resolveNode();
  const codexBin = await resolveCodex();
  await mkdir(HOST_DIR, { recursive: true });
  for (const name of ['tempo-agent.mjs', 'protocol.mjs']) {
    await writeFile(path.join(HOST_DIR, name), await readFile(path.join(root, 'host', name), 'utf8'), 'utf8');
  }
  const launcher = path.join(HOST_DIR, 'launcher.sh');
  await writeFile(
    launcher,
    `#!/bin/sh\n` +
      `# Собрано \`npm run agent:install\`. Правки в host/ доедут сюда только\n` +
      `# следующей установкой — это копия, а не ссылка.\n` +
      `export TEMPO_CODEX_HOME=${sh(AGENT_HOME)}\n` +
      `export TEMPO_CODEX_BIN=${sh(codexBin)}\n` +
      `exec ${sh(nodeBin)} ${sh(path.join(HOST_DIR, 'tempo-agent.mjs'))} "$@"\n`,
    'utf8',
  );
  await chmod(launcher, 0o755);
  return { launcher, nodeBin, codexBin };
}

export async function findCodex() {
  if (process.env.TEMPO_CODEX_BIN) return process.env.TEMPO_CODEX_BIN;
  return lookup('codex');
}

async function lookup(name) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('/bin/sh', ['-lc', `command -v ${name}`], (error, stdout) => {
      const found = String(stdout || '').trim().split('\n')[0];
      resolve(error || !found ? null : found);
    });
  });
}

async function resolveNode() {
  const found = await lookup('node');
  if (!found) return process.execPath;
  try {
    const [a, b] = await Promise.all([realpath(found), realpath(process.execPath)]);
    return a === b ? found : process.execPath;
  } catch {
    return process.execPath;
  }
}

async function resolveCodex() {
  return (await findCodex()) || 'codex';
}

async function prepareHome() {
  await mkdir(AGENT_HOME, { recursive: true });
  const config = path.join(AGENT_HOME, 'config.toml');
  if (!existsSync(config)) {
    await writeFile(
      config,
      `# Каталог агента Tempo. Отдельный от ~/.codex намеренно:\n` +
        `# на рабочем каталоге Codex тот же запрос идёт 24 с вместо 4 —\n` +
        `# там плагины, память и навыки, которые разбору твита не нужны.\n` +
        `model = "gpt-5.6-luna"\n` +
        `model_reasoning_effort = "low"\n`,
      'utf8',
    );
  }
  return { home: AGENT_HOME, loggedIn: existsSync(path.join(AGENT_HOME, 'auth.json')) };
}

async function adopt() {
  const source = path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'auth.json');
  const target = path.join(AGENT_HOME, 'auth.json');
  if (!existsSync(source)) {
    console.log(`Нечего переносить: ${source} не найден. Войдите обычным путём — npm run agent:login`);
    return false;
  }
  await mkdir(AGENT_HOME, { recursive: true });
  await writeFile(target, await readFile(source, 'utf8'), { encoding: 'utf8', mode: 0o600 });
  console.log(`Вход перенесён из ${source}.`);
  console.log('Если однажды агент скажет «нужен вход» — это разъехались токены, лечится `npm run agent:login`.');
  return true;
}

async function install(extraIds) {
  const distId = extensionIdFor(path.join(root, 'dist'));
  const ids = [...new Set([distId, ...extraIds])];
  const { launcher, nodeBin, codexBin } = await installHost();
  const home = await prepareHome();

  const manifest = {
    name: HOST_NAME,
    description: 'Мост Tempo к Codex CLI',
    path: launcher,
    type: 'stdio',
    allowed_origins: ids.map((id) => `chrome-extension://${id}/`),
  };

  const written = [];
  for (const target of hostDirs()) {
    if (!target.exists) continue;
    await mkdir(target.dir, { recursive: true });
    await writeFile(path.join(target.dir, `${HOST_NAME}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    written.push(target.name);
  }

  console.log('Мост Tempo → Codex установлен.\n');
  console.log(`  расширение   ${ids.join('\n               ')}`);
  console.log(`  мост         ${HOST_DIR}`);
  console.log(`  node         ${nodeBin}`);
  console.log(`  codex        ${codexBin}`);
  console.log(`  каталог      ${home.home}`);
  console.log(`  браузеры     ${written.length ? written.join(', ') : 'ни одного не нашлось'}`);
  if (!written.length) {
    console.log('\nНи один каталог браузера не найден. Запустите Chrome хотя бы раз и повторите.');
  }
  if (!home.loggedIn) {
    console.log('\nОсталось войти в Codex — один раз, обычным окном ChatGPT:\n');
    console.log('  npm run agent:login\n');
    console.log('Либо перенести вход из рабочего ~/.codex (цена — в docs/AGENT.md):\n');
    console.log('  npm run agent:install -- --adopt\n');
  }
  if (!existsSync(path.join(root, 'dist/manifest.json'))) {
    console.log('\nПапки dist ещё нет: id посчитан по её будущему пути. Соберите — `npm run build`.');
  }
}

async function uninstall() {
  const removed = [];
  for (const target of hostDirs()) {
    const file = path.join(target.dir, `${HOST_NAME}.json`);
    if (!existsSync(file)) continue;
    await rm(file);
    removed.push(target.name);
  }
  await rm(HOST_DIR, { recursive: true, force: true });
  console.log(removed.length ? `Мост снят: ${removed.join(', ')}` : 'Мост нигде не стоял.');
  console.log(`Каталог агента остался на месте: ${AGENT_HOME} (в нём вход в Codex).`);
}

export async function readInstalled() {
  for (const target of hostDirs()) {
    const file = path.join(target.dir, `${HOST_NAME}.json`);
    if (!existsSync(file)) continue;
    try {
      return { browser: target.name, file, manifest: JSON.parse(await readFile(file, 'utf8')) };
    } catch {
      return { browser: target.name, file, manifest: null };
    }
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--uninstall')) await uninstall();
  else {
    await install(args.filter((arg) => /^[a-p]{32}$/.test(arg)));
    if (args.includes('--adopt')) {
      console.log('');
      await adopt();
    }
  }
}
