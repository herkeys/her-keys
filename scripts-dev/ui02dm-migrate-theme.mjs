/**
 * HK-FE-UI-02-DM · DM-02..05 — mechanical migration of theme-dependent token consumers to the live theme (TypeScript AST codemod).
 *
 *   node scripts-dev/ui02dm-migrate-theme.mjs --dry     report only
 *   node scripts-dev/ui02dm-migrate-theme.mjs --write   apply
 *
 * What it does, per file that imports `color`, `colors`, `elevation` or `interaction` from the design tokens:
 *   1. module-scope `const X = StyleSheet.create({...})` that reads those tokens → `const useX = createThemedStyles(({ ... }) => StyleSheet.create({...}))`
 *      and every component/hook function that uses `X` gets `const X = useX();` as its first statement;
 *   2. every component/hook function that reads the tokens directly gets `const { ... } = useTheme();` as its first statement
 *      (the SAME local names are kept, so no reference changes: the hook's destructuring simply shadows the removed import);
 *   3. the themed names are removed from the tokens import and `useTheme` / `createThemedStyles` are imported from the theme module.
 *
 * It refuses (and lists for manual review) anything it cannot do safely: module-scope constants that read the theme, non-component
 * helper functions that read the theme, module-scope uses of a themed style constant, exported style constants.
 * Idempotent: a migrated file no longer imports the themed names, so a second run finds nothing to do.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THEMED = new Set(['color', 'colors', 'elevation', 'interaction']);
const write = process.argv.includes('--write');
const posix = (p) => p.split(sep).join('/');

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });

const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))].filter((f) => {
  const rel = posix(relative(ROOT, f));
  return rel !== 'src/design/tokens.ts' && !rel.startsWith('src/design/theme/');
});

const isComponentLike = (name) => name !== null && (/^[A-Z]/.test(name) || /^use[A-Z0-9]/.test(name) || name === 'default');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const manual = [];
const report = { migrated: 0, files: [] };

for (const file of files) {
  const rel = posix(relative(ROOT, file));
  const text = readFileSync(file, 'utf8');
  const crlf = text.includes(String.fromCharCode(13));
  const src = text.split(String.fromCharCode(13)).join('');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  // ---- the tokens import
  let tokensImport = null;
  const local = new Map(); // localName -> original
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && /(^|\/)tokens$/.test(st.moduleSpecifier.text) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      for (const el of st.importClause.namedBindings.elements) {
        const original = (el.propertyName ?? el.name).text;
        if (THEMED.has(original) && !el.isTypeOnly) {
          tokensImport = st;
          local.set(el.name.text, original);
        }
      }
    }
  }
  if (!tokensImport) continue;

  const fnOf = (node) => {
    const chain = [];
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isArrowFunction(p) || ts.isMethodDeclaration(p)) chain.push(p);
    }
    return chain;
  };
  const fnName = (fn) => {
    if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
    let p = fn.parent;
    if (ts.isParenthesizedExpression(p)) p = p.parent;
    if (ts.isCallExpression(p)) p = p.parent; // memo(...) / forwardRef(...)
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isExportAssignment(p)) return 'default';
    return null;
  };
  const isRefIdent = (id) => {
    const p = id.parent;
    if (ts.isImportSpecifier(p)) return false;
    if (ts.isBindingElement(p) && p.name === id) return false;
    if (ts.isParameter(p) && p.name === id) return false;
    if (ts.isVariableDeclaration(p) && p.name === id) return false;
    for (let q = p; q; q = q.parent) {
      if (ts.isCallExpression(q) && /^(themed|createThemedStyles)(<.*>)?$/.test(q.expression.getText(sf))) return false; // already a theme-derived factory
    }
    if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
    if (ts.isPropertyAssignment(p) && p.name === id) return false;
    if (ts.isQualifiedName(p)) return false;
    for (let q = p; q; q = q.parent) if (ts.isTypeQueryNode(q) || ts.isTypeNode(q) && !ts.isExpressionWithTypeArguments(q)) { if (ts.isTypeQueryNode(q)) return false; }
    return true;
  };
  const styleCreateOwner = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && p.expression.getText(sf) === 'StyleSheet.create') {
        const decl = p.parent;
        if (ts.isVariableDeclaration(decl) && decl.initializer === p && ts.isIdentifier(decl.name) && ts.isVariableStatement(decl.parent.parent) && ts.isSourceFile(decl.parent.parent.parent)) return { decl, call: p };
        return { decl: null, call: p };
      }
    }
    return null;
  };

  // ---- classify every themed reference
  const themedUse = new Map(); // outer fn -> Set(local names)
  const styleDecls = new Map(); // decl -> { call, names:Set }
  let blocked = false;
  const block = (why, node) => {
    blocked = true;
    manual.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${why}`);
  };

  const scan = (node) => {
    if (ts.isIdentifier(node) && local.has(node.text) && isRefIdent(node)) {
      const chain = fnOf(node);
      if (chain.length === 0) {
        const owner = styleCreateOwner(node);
        if (owner?.decl) {
          const entry = styleDecls.get(owner.decl) ?? { call: owner.call, names: new Set() };
          entry.names.add(node.text);
          styleDecls.set(owner.decl, entry);
        } else block(`module-scope read of \`${node.text}\` outside a simple StyleSheet.create constant`, node);
      } else {
        const outer = chain[chain.length - 1];
        if (!isComponentLike(fnName(outer))) block(`\`${node.text}\` read in non-component function \`${fnName(outer) ?? '(anonymous)'}\``, node);
        else {
          const set = themedUse.get(outer) ?? new Set();
          set.add(node.text);
          themedUse.set(outer, set);
        }
      }
    }
    ts.forEachChild(node, scan);
  };
  scan(sf);

  // ---- users of each themed style constant
  const styleUsers = new Map(); // outer fn -> Set(const names)
  for (const [decl] of styleDecls) {
    const name = decl.name.text;
    if (sf.statements.some((s) => ts.isVariableStatement(s) && s.declarationList.declarations.includes(decl) && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))) {
      block(`themed style constant \`${name}\` is exported`, decl);
      continue;
    }
    const findUses = (node) => {
      if (ts.isIdentifier(node) && node.text === name && node !== decl.name && isRefIdent(node)) {
        const chain = fnOf(node);
        if (chain.length === 0) block(`module-scope use of themed style constant \`${name}\``, node);
        else {
          const outer = chain[chain.length - 1];
          if (!isComponentLike(fnName(outer))) block(`themed style constant \`${name}\` used in non-component function \`${fnName(outer) ?? '(anonymous)'}\``, node);
          else {
            const set = styleUsers.get(outer) ?? new Set();
            set.add(name);
            styleUsers.set(outer, set);
          }
        }
      }
      ts.forEachChild(node, findUses);
    };
    findUses(sf);
  }

  if (blocked) continue;

  // ---- build edits
  const edits = []; // { start, end, text }
  const destructure = (names) => names.map((n) => (local.get(n) === n ? n : `${local.get(n)}: ${n}`)).join(', ');

  for (const [decl, { call, names }] of styleDecls) {
    const arg = call.arguments[0];
    const list = destructure([...names].sort());
    edits.push({ start: call.getStart(sf), end: call.getEnd(), text: `createThemedStyles(({ ${list} }) => StyleSheet.create(${arg.getText(sf)}))` });
    edits.push({ start: decl.name.getStart(sf), end: decl.name.getEnd(), text: `use${cap(decl.name.text)}` });
  }

  const hosts = new Set([...themedUse.keys(), ...styleUsers.keys()]);
  for (const fn of hosts) {
    const lines = [];
    const used = themedUse.get(fn);
    if (used && used.size > 0) lines.push(`const { ${destructure([...used].sort())} } = useTheme();`);
    for (const name of [...(styleUsers.get(fn) ?? [])].sort()) lines.push(`const ${name} = use${cap(name)}();`);
    const lineStart = src.lastIndexOf('\n', fn.getStart(sf)) + 1;
    const baseIndent = /^\s*/.exec(src.slice(lineStart))[0];
    const indent = `${baseIndent}  `;
    const body = fn.body;
    if (ts.isBlock(body)) {
      edits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: `\n${indent}${lines.join(`\n${indent}`)}` });
    } else {
      edits.push({ start: body.getStart(sf), end: body.getEnd(), text: `{\n${indent}${lines.join(`\n${indent}`)}\n${indent}return ${body.getText(sf)};\n${baseIndent}}` });
    }
  }

  // ---- imports
  const needsTheme = [...themedUse.values()].some((s) => s.size > 0);
  const needsStyles = styleDecls.size > 0;
  const named = tokensImport.importClause.namedBindings.elements;
  const kept = named.filter((el) => !(THEMED.has((el.propertyName ?? el.name).text) && !el.isTypeOnly));
  const themeSpecifier = tokensImport.moduleSpecifier.text.replace(/tokens$/, 'theme');
  const themeNames = [needsStyles ? 'createThemedStyles' : null, needsTheme || styleUsers.size > 0 ? null : null, needsTheme ? 'useTheme' : null].filter(Boolean);
  const existingTheme = sf.statements.find((st) => ts.isImportDeclaration(st) && st.moduleSpecifier.text === themeSpecifier && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings));
  let themeImport = themeNames.length ? `import { ${themeNames.join(', ')} } from '${themeSpecifier}';` : '';
  if (existingTheme && themeNames.length) {
    const have = existingTheme.importClause.namedBindings.elements.map((el) => el.getText(sf));
    const all = [...new Set([...have, ...themeNames])];
    edits.push({ start: existingTheme.getStart(sf), end: existingTheme.getEnd(), text: `import { ${all.join(', ')} } from '${themeSpecifier}';` });
    themeImport = '';
  }
  const q = tokensImport.moduleSpecifier.getText(sf)[0];
  const keptText = kept.length ? `import { ${kept.map((el) => el.getText(sf)).join(', ')} } from ${q}${tokensImport.moduleSpecifier.text}${q};` : '';
  const replacement = [keptText, themeImport].filter(Boolean).join('\n');
  edits.push({ start: tokensImport.getStart(sf), end: tokensImport.getEnd(), text: replacement });

  // apply back to front
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  report.migrated += 1;
  report.files.push({ rel, hosts: hosts.size, styles: styleDecls.size });
  if (write) writeFileSync(file, crlf ? out.split('\n').join(String.fromCharCode(13) + '\n') : out);
}

console.log(JSON.stringify({ mode: write ? 'write' : 'dry', migrated: report.migrated, manualReview: manual.length }, null, 2));
console.log(manual.map((m) => ` - ${m}`).join('\n'));
