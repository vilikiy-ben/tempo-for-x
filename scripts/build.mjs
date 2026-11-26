import { build, context, transform } from 'esbuild';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeIcons } from './make-icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const cssText = {
  name: 'css-text',
  setup(api) {
    api.onLoad({ filter: /\.css$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      if (watch) return { contents: source, loader: 'text' };
      const { code } = await transform(source, {
        loader: 'css',
        minify: true,
        charset: 'utf8',
        target: 'chrome120',
      });
      return { contents: code, loader: 'text' };
    });
  },
};

const options = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  charset: 'utf8',
  legalComments: 'none',
  loader: { '.css': 'text' },
  plugins: [cssText],
  logLevel: 'info',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  absWorkingDir: root,
};

const bundles = [
  { in: 'src/background/index.js', out: 'background.js' },
  { in: 'src/content/index.js', out: 'content.js' },
  { in: 'src/content/harvest.js', out: 'harvest.js' },
];

async function copyStatic() {
  await cp(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
  await cp(path.join(root, '_locales'), path.join(dist, '_locales'), { recursive: true });
  await writeIcons(path.join(dist, 'icons'));
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (watch) {
  for (const bundle of bundles) {
    const ctx = await context({ ...options, entryPoints: [bundle.in], outfile: `dist/${bundle.out}` });
    await ctx.watch();
  }
  await copyStatic();
  console.log(`tempo: сборка в режиме наблюдения — в Chrome указывать ${dist}`);
} else {
  await Promise.all(
    bundles.map((bundle) =>
      build({ ...options, entryPoints: [bundle.in], outfile: `dist/${bundle.out}` }),
    ),
  );
  await copyStatic();
  console.log(`tempo: собрано — в Chrome указывать ${dist}`);
}
