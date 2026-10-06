import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript/unstable/ast';
import { API } from 'typescript/unstable/sync';

const root = fileURLToPath(new URL('../', import.meta.url));
const policies = {
  contracts: [], domain: ['contracts'], crypto: ['contracts'], storage: ['contracts'], sync: ['contracts'],
  application: ['contracts', 'domain', 'crypto', 'storage', 'sync'],
};
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
const api = new API({ cwd: root });
try {
const config = path.join(root, 'tsconfig.json');
const snapshot = api.updateSnapshot({ openProjects: [config] });
const project = snapshot.getProject(config);
if (!project) throw new Error('TypeScript project not found');
const parse = filename => {
  const source = project.program.getSourceFile(filename);
  if (!source) throw new Error(`Source not found in TypeScript project: ${filename}`);
  return source;
};
let checked = 0;
for (const [name, allowed] of Object.entries(policies)) {
  const packageRoot = path.join(root, 'packages', name);
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  for (const filename of files(path.join(packageRoot, 'src'))) {
    const source = parse(filename);
    function check(specifier) {
      if (specifier.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), specifier);
        if (!target.startsWith(packageRoot + path.sep)) throw new Error(`Cross-package relative import: ${filename}`);
      } else {
        const match = /^@paymentplan\/([^/]+)$/.exec(specifier);
        if (!match || !allowed.includes(match[1]) || !manifest.dependencies?.[specifier])
          throw new Error(`Forbidden dependency ${specifier} in ${name}`);
      }
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) check(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node)) {
        if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) throw new Error('Nonliteral type import');
        check(node.argument.literal.text);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) throw new Error('Nonliteral dynamic import');
        check(node.arguments[0].text);
      }
      node.forEachChild(visit);
    }
    visit(source); checked++;
  }
}
// Production UI must not ship test transports or the architecture prototypes.
for (const filename of files(path.join(root, 'apps/pwa/src'))) {
  const source = parse(filename);
  function visit(node) {
    if (ts.isStringLiteral(node) && (node.text.includes('/testing') || node.text.includes('tools/architecture')))
      throw new Error(`Test-only code referenced by UI: ${filename}`);
    node.forEachChild(visit);
  }
  visit(source);
}
console.log(`PASS: ${checked} package source files respect dependency boundaries.`);
} finally { api.close(); }
