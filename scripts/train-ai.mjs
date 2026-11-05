import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const { values } = parseArgs({ options: {
  seed: { type: 'string', default: '1504' },
  generations: { type: 'string', default: '6' },
  population: { type: 'string', default: '5' },
  games: { type: 'string', default: '16' },
  validation: { type: 'string', default: '32' },
} });
// Load the same TypeScript policy as the app without adding a script runtime.
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' });
try {
  const { trainSelfPlay, evaluatePolicies } = await vite.ssrLoadModule('/src/ai/training.ts');
  const { BASE_WEIGHTS } = await vite.ssrLoadModule('/src/ai/opponent.ts');
  const started = Date.now();
  const initialWeights = JSON.parse(await readFile(new URL('../src/ai/trained.json', import.meta.url), 'utf8'));
  const result = trainSelfPlay({
    initialWeights,
    seed: Number(values.seed), generations: Number(values.generations), population: Number(values.population),
    gamesPerCandidate: Number(values.games), validationGames: Number(values.validation),
    onGeneration: entry => console.log(JSON.stringify(entry)),
  });
  const benchmark = {
    versusBaseline: evaluatePolicies(result.weights, BASE_WEIGHTS, Number(values.validation), Number(values.seed) ^ 0x77bfea21),
    versusRandom: evaluatePolicies(result.weights, 'random', Number(values.validation), Number(values.seed) ^ 0x19acb032),
  };
  const report = { ...result.report, benchmark, elapsedSeconds: Math.round((Date.now() - started) / 1000) };
  await writeFile(new URL('../src/ai/trained.json', import.meta.url), `${JSON.stringify(result.weights, null, 2)}\n`);
  await writeFile(new URL('../docs/ai-training-report.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ promoted: report.promoted, trainingGames: report.trainingGames, validation: report.validation, benchmark, elapsedSeconds: report.elapsedSeconds }, null, 2));
} finally {
  await vite.close();
}
