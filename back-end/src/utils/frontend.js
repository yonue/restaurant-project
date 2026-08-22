const fs = require('fs');
const path = require('path');

function resolveFrontendPublicDir() {
  const projectRoot = path.join(__dirname, '..', '..');

  const directCandidates = [
    path.join(projectRoot, 'e-commerce-front-end(1)', 'public'),
    path.join(projectRoot, 'e-commerce-front-end', 'public'),
    path.join(projectRoot, 'e-commerce-front-end(2)', 'public'),
    path.join(projectRoot, 'e-commerce-front-end(3)', 'public'),
  ];

  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const fallback = fs
    .readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('e-commerce-front-end'))
    .map((entry) => path.join(projectRoot, entry.name, 'public'))
    .find((dir) => fs.existsSync(dir));

  return fallback || path.join(projectRoot, 'public');
}

module.exports = {
  resolveFrontendPublicDir,
};
