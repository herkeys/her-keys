/**
 * HK-FE-UI-02-DM · DM-00 — adaptive-appearance impact inventory (AST based).
 *
 * For every .ts/.tsx file under app/ and src/ (except the token module) this finds each reference to a THEME-DEPENDENT token binding
 * imported from the design tokens (`color`, `colors`, `elevation`, `interaction`, `brandPalette`, `botanicalPalette`, `withAlpha`
 * results are derived from those) and classifies WHERE the reference lives, because that decides how it must migrate:
 *
 *   styleSheet  — inside a module-scope `StyleSheet.create(...)` (frozen at import time: must become a theme-derived style factory)
 *   moduleConst — inside another module-scope initialiser (frozen at import time: must become a theme-derived factory/lazy value)
 *   component   — inside a component/hook body (capitalised or `use*` function): reads the theme with a hook, re-renders on change
 *   helper      — inside a lowercase non-hook function (called from render, handlers or elsewhere): must take the theme as an argument
 *
 * It also counts hard-coded colour literals. Output: docs/design-system/HK-FE-UI-02-DM-impact-inventory.generated.md + JSON on stdout.
 * Presentation-only tooling: reads source, writes one doc.
 *
 *   node scripts-dev/ui02dm-impact-inventory.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THEMED = new Set(['color', 'colors', 'elevation', 'interaction', 'brandPalette', 'botanicalPalette']);
const posix = (p) => p.split(sep).join('/');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });
}

const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))].filter((f) => posix(relative(ROOT, f)) !== 'src/design/tokens.ts');

const isComponentName = (n) => /^[A-Z]/.test(n) || /^use[A-Z0-9]/.test(n);

function analyse(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  // which themed names does this file import from a tokens module?
  const imported = new Set();
  sf.forEachChild((n) => {
    if (ts.isImportDeclaration(n) && /design\/tokens$|\.\/tokens$/.test(n.moduleSpecifier.text) && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
      for (const el of n.importClause.namedBindings.elements) {
        const local = el.name.text;
        const original = (el.propertyName ?? el.name).text;
        if (THEMED.has(original)) imported.add(local);
      }
    }
  });
  if (imported.size === 0) return null;

  const out = { styleSheet: 0, moduleConst: 0, component: 0, helper: 0, hard: 0, names: [...imported].sort(), helpers: [], moduleConsts: [] };

  const enclosingFunctions = (node) => {
    const chain = [];
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) chain.push(p);
    }
    return chain;
  };
  const nameOfFunction = (fn) => {
    if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
    const parent = fn.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    if (ts.isCallExpression(parent)) {
      // memo(function X) / forwardRef(...) wrappers are named by their variable
      const gp = parent.parent;
      if (ts.isVariableDeclaration(gp) && ts.isIdentifier(gp.name)) return gp.name.text;
    }
    if (ts.isExportAssignment(parent)) return 'default';
    return null;
  };
  const insideStyleSheetCreate = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && p.expression.getText(sf) === 'StyleSheet.create') return true;
    }
    return false;
  };
  const moduleVarName = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isVariableDeclaration(p) && p.parent?.parent?.parent && ts.isSourceFile(p.parent.parent.parent) && ts.isIdentifier(p.name)) return p.name.text;
      if (ts.isVariableDeclaration(p) && p.parent?.parent && ts.isVariableStatement(p.parent.parent) && ts.isSourceFile(p.parent.parent.parent)) return ts.isIdentifier(p.name) ? p.name.text : '(pattern)';
    }
    return null;
  };

  const visit = (node) => {
    if (ts.isIdentifier(node) && imported.has(node.text)) {
      const parent = node.parent;
      const isDeclaration = ts.isImportSpecifier(parent) || (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node);
      const isShorthandKey = ts.isShorthandPropertyAssignment(parent);
      if (!isDeclaration || isShorthandKey) {
        const chain = enclosingFunctions(node);
        if (chain.length === 0) {
          if (insideStyleSheetCreate(node)) out.styleSheet += 1;
          else {
            out.moduleConst += 1;
            const name = moduleVarName(node);
            if (name && !out.moduleConsts.includes(name)) out.moduleConsts.push(name);
          }
        } else {
          // the OUTERMOST enclosing function decides: nested closures inherit its theme binding
          const outer = chain[chain.length - 1];
          // a StyleSheet.create inside a function body is a render-time style creation → fine
          const nm = nameOfFunction(outer);
          if (nm && isComponentName(nm)) out.component += 1;
          else if (nm === 'default') out.component += 1;
          else {
            out.helper += 1;
            const label = nm ?? '(anonymous)';
            if (!out.helpers.includes(label)) out.helpers.push(label);
          }
        }
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^#[0-9a-fA-F]{3,8}$|^rgba?\(/.test(node.text)) out.hard += 1;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const rows = [];
let hardOnly = [];
for (const file of files) {
  const r = analyse(file);
  const rel = posix(relative(ROOT, file));
  if (r) rows.push({ rel, ...r });
  else {
    const hard = [...readFileSync(file, 'utf8').matchAll(/['"`]#[0-9a-fA-F]{3,8}['"`]|rgba?\(/g)].length;
    if (hard) hardOnly.push({ rel, hard });
  }
}

const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
let md = `# HK-FE-UI-02-DM — DM-00 generated impact inventory\n\nGenerated by \`scripts-dev/ui02dm-impact-inventory.mjs\` (TypeScript AST) from the pinned baseline \`ca9e792\`. Do not hand-edit.\n\n`;
md += `Themed token bindings: \`color\`, \`colors\`, \`elevation\`, \`interaction\`, \`brandPalette\`, \`botanicalPalette\`.\n\n`;
md += `| | Files | References |\n|---|---|---|\n`;
md += `| files importing a themed binding | ${rows.length} | — |\n`;
md += `| **styleSheet** — inside module-scope \`StyleSheet.create\` (frozen at import) | ${rows.filter((r) => r.styleSheet).length} | ${sum('styleSheet')} |\n`;
md += `| **moduleConst** — other module-scope initialisers (frozen at import) | ${rows.filter((r) => r.moduleConst).length} | ${sum('moduleConst')} |\n`;
md += `| **component** — inside a component/hook body | ${rows.filter((r) => r.component).length} | ${sum('component')} |\n`;
md += `| **helper** — inside a non-component function | ${rows.filter((r) => r.helper).length} | ${sum('helper')} |\n`;
md += `| hard-coded colour literals in themed-importing files | ${rows.filter((r) => r.hard).length} | ${sum('hard')} |\n`;
md += `| files with hard-coded colour literals but no token import | ${hardOnly.length} | ${hardOnly.reduce((s, r) => s + r.hard, 0)} |\n\n`;
md += `## Module-scope constants that read the theme (each needs a theme-derived form)\n\n`;
for (const r of rows.filter((x) => x.moduleConsts.length)) md += `- \`${r.rel}\`: ${r.moduleConsts.map((c) => `\`${c}\``).join(', ')}\n`;
md += `\n## Non-component helpers that read the theme\n\n`;
for (const r of rows.filter((x) => x.helpers.length)) md += `- \`${r.rel}\`: ${r.helpers.map((c) => `\`${c}\``).join(', ')}\n`;
md += `\n## Hard-coded colour literals outside the token module\n\n`;
for (const r of [...rows.filter((x) => x.hard).map((x) => ({ rel: x.rel, hard: x.hard })), ...hardOnly]) md += `- \`${r.rel}\`: ${r.hard}\n`;
md += `\n## Per file\n\n| File | imports | styleSheet | moduleConst | component | helper | hard |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows.sort((a, b) => a.rel.localeCompare(b.rel))) md += `| \`${r.rel}\` | ${r.names.join(', ')} | ${r.styleSheet || '—'} | ${r.moduleConst || '—'} | ${r.component || '—'} | ${r.helper || '—'} | ${r.hard || '—'} |\n`;

writeFileSync(join(ROOT, 'docs/design-system/HK-FE-UI-02-DM-impact-inventory.generated.md'), md);
console.log(JSON.stringify({
  files: rows.length,
  styleSheetFiles: rows.filter((r) => r.styleSheet).length, styleSheetRefs: sum('styleSheet'),
  moduleConstFiles: rows.filter((r) => r.moduleConst).length, moduleConstRefs: sum('moduleConst'),
  componentFiles: rows.filter((r) => r.component).length, componentRefs: sum('component'),
  helperFiles: rows.filter((r) => r.helper).length, helperRefs: sum('helper'),
  hardInThemed: sum('hard'), hardOnlyFiles: hardOnly.length,
}, null, 2));
