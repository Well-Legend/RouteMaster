import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

function requireFile(path: string) {
    assert.equal(existsSync(path), true, `missing required file: ${path}`);
}

function requireIncludes(content: string, expected: string, source: string) {
    assert.ok(content.includes(expected), `${source} should include "${expected}"`);
}

const requiredFiles = [
    '.env.example',
    'app.config.js',
    'scripts/build_install_debug.sh',
    'scripts/build_release.sh',
    'scripts/start_metro.sh',
    'docs/agent-team-spec.md',
    'docs/agent-thread-prompts.md',
    'docs/agent-handoff-template.md',
    '.agent/rules/architecture.md',
];

for (const path of requiredFiles) {
    requireFile(path);
}

const readme = readFileSync('README.md', 'utf8');
requireIncludes(readme, '## Project Notes', 'README.md');
requireIncludes(readme, 'docs/agent-team-spec.md', 'README.md');
requireIncludes(readme, 'docs/agent-thread-prompts.md', 'README.md');
requireIncludes(readme, 'docs/agent-handoff-template.md', 'README.md');
requireIncludes(readme, 'GOOGLE_MAPS_ANDROID_API_KEY', 'README.md');

const architectureRule = readFileSync('.agent/rules/architecture.md', 'utf8');
requireIncludes(architectureRule, 'src/', '.agent/rules/architecture.md');
requireIncludes(architectureRule, 'src/features/', '.agent/rules/architecture.md');
requireIncludes(architectureRule, 'src/supabase/', '.agent/rules/architecture.md');
requireIncludes(architectureRule, 'app/', '.agent/rules/architecture.md');

const expoConfig = readFileSync('app.config.js', 'utf8');
requireIncludes(expoConfig, 'GOOGLE_MAPS_ANDROID_API_KEY', 'app.config.js');
assert.equal(expoConfig.includes('AIza'), false, 'app.config.js should not hardcode a Google Maps API key');

console.log('release readiness evidence checks passed');
