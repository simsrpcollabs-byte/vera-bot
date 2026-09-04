const fs = require('node:fs');
const path = require('node:path');

const releaseType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(releaseType)) {
  throw new Error('Use patch, minor, or major.');
}

const root = __dirname;
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const readmePath = path.join(root, 'README.md');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const [major, minor, patch] = packageJson.version.split('.').map(Number);
const next = releaseType === 'major' ? `${major + 1}.0.0`
  : releaseType === 'minor' ? `${major}.${minor + 1}.0`
    : `${major}.${minor}.${patch + 1}`;

packageJson.version = next;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(/\*\*Current version: [^*]+\*\*/, `**Current version: ${next}**`);
readme = readme.replace(/## Included in Version [^\n]+/, `## Included in Version ${next}`);
fs.writeFileSync(readmePath, readme);
console.log(`VERA version updated to ${next}.`);
