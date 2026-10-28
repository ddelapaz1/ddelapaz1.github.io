// Genera index.html a l'arrel del repositori: una sola pàgina autònoma (CSS i JavaScript en línia) que
// funciona obrint-la directament des del disc, a GitHub Pages o pujada a Moodle.
// Agrupa els mòduls ES de src/js sense dependències externes.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve('src');
const OUT = resolve('.');
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*$/gm;
const EXPORT_RE = /^export\s+(?:async\s+)?(function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map();
const order = [];

function load(file) {
  if (modules.has(file)) return;
  modules.set(file, null);
  let code = readFileSync(file, 'utf8');
  const deps = [];
  code = code.replace(IMPORT_RE, (_, names, spec) => {
    const dep = resolve(dirname(file), spec);
    deps.push(dep);
    const binds = names.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => { const [a, b] = n.split(/\s+as\s+/); return b ? `${a}: ${b}` : a; });
    return `const { ${binds.join(', ')} } = __m[${JSON.stringify(key(dep))}];`;
  });
  if (/^\s*(import|export)\b(?!\s+(async\s+)?(function|const|let|class)\b)/m.test(code)) {
    throw new Error(`Sintaxi d'import/export no suportada a ${file}`);
  }
  const names = [];
  code = code.replace(EXPORT_RE, (m, kw, name) => { names.push(name); return m.replace(/^export\s+/, ''); });
  for (const d of deps) load(d);
  modules.set(file, { code, names });
  order.push(file);
}

const key = (f) => relative(join(SRC, 'js'), f).split('\\').join('/');

load(join(SRC, 'js', 'main.js'));

let bundle = '(() => {\n\'use strict\';\nconst __m = {};\n';
for (const f of order) {
  const { code, names } = modules.get(f);
  bundle += `\n// ---- ${key(f)} ----\n__m[${JSON.stringify(key(f))}] = (() => {\n${code}\nreturn { ${names.join(', ')} };\n})();\n`;
}
bundle += '})();\n';

const css = readFileSync(join(SRC, 'css', 'styles.css'), 'utf8');
const leafletCss = readFileSync(join(SRC, 'vendor', 'leaflet', 'leaflet.css'), 'utf8');
const leafletJs = readFileSync(join(SRC, 'vendor', 'leaflet', 'leaflet.js'), 'utf8');
let html = readFileSync(join(SRC, 'index.html'), 'utf8');
const inlineScript = (code) => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}</script>`;
html = html.replace('<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', () => `<style>\n/* Leaflet 1.9.4 · BSD-2-Clause · © Volodymyr Agafonkin, CloudMade */\n${leafletCss}</style>`);
html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script src="vendor/leaflet/leaflet.js"></script>', () => inlineScript(leafletJs));
html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${bundle.replace(/<\/script/gi, '<\\/script')}</script>`);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`index.html generat (${order.length} mòduls, ${(html.length / 1024).toFixed(0)} kB)`);
