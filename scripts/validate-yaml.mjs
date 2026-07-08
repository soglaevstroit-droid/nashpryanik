import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const files = [
  '.github/workflows/platform-checks.yml',
  'infra/docker/docker-compose.yml',
  'apps/mobile/pubspec.yaml',
  'apps/mobile/analysis_options.yaml',
];

for (const file of files) {
  parse(readFileSync(file, 'utf8'));
  console.log(`YAML valid: ${file}`);
}
