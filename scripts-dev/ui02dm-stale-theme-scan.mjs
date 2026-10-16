// HK-FE-UI-02-DM — read-only scan for stale-theme hazards after the module-scope migration (theme values captured in useState/useRef,
// useMemo/useCallback without theme deps, module-scope initialisers reading theme names). Helpers wrapped in themed<...>() are expected hits.
// Read-only scan for stale-theme hazards after the module-scope migration.
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const BS = String.fromCharCode(92);
const files = ['app', 'src']
  .flatMap((d) => readdirSync(d, { recursive: true }).map((f) => `${d}/${String(f).split(BS).join('/')}`))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('src/design/theme/'));
const THEME_NAMES = new Set(['color', 'colors', 'elevation', 'interaction', 'theme']);
const report = { stateRef: [], memoMissingDeps: [], moduleScopeTheme: [], moduleScopeUse: [], styleCreateInBody: [] };
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const usesTheme = (node) => {
    let hit = false;
    const walk = (n) => {
      if (hit) return;
      if (ts.isIdentifier(n) && THEME_NAMES.has(n.text) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n)) hit = true;
      ts.forEachChild(n, walk);
    };
    walk(node);
    return hit;
  };
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const visit = (node, depth) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if ((name === 'useState' || name === 'useRef') && node.arguments[0] && usesTheme(node.arguments[0])) report.stateRef.push(`${f}:${line(node)} ${name}(…theme…)`);
      if ((name === 'useMemo' || name === 'useCallback' || name === 'useEffect') && node.arguments[0] && usesTheme(node.arguments[0])) {
        const deps = node.arguments[1];
        const depText = deps ? deps.getText() : '';
        const named = [...THEME_NAMES].some((t) => new RegExp(`\\b${t}\\b|\\bstyles\\b|\\bc\\b`).test(depText));
        if (!deps || !named) report.memoMissingDeps.push(`${f}:${line(node)} ${name} deps=${depText || '(none)'}`);
      }
      if (name === 'useTheme' || name === 'useAppearance' || /^use[A-Z]\w*Styles$/.test(name)) {
        if (depth === 0) report.moduleScopeUse.push(`${f}:${line(node)} ${name} at module scope`);
      }
      if (name === 'StyleSheet' ) {/* no-op */}
    }
    // module-scope declarations whose initialiser reads a theme identifier (would be a stale capture)
    if (depth === 0 && ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (d.initializer && !ts.isArrowFunction(d.initializer) && !ts.isFunctionExpression(d.initializer) && usesTheme(d.initializer)) {
          if (!/createThemedStyles|themed\(/.test(d.initializer.getText().slice(0, 40))) report.moduleScopeTheme.push(`${f}:${line(node)} ${d.name.getText()}`);
        }
      }
    }
    if (ts.isFunctionLike(node) || ts.isArrowFunction(node)) depth += 1;
    ts.forEachChild(node, (c) => visit(c, depth));
  };
  visit(sf, 0);
  // StyleSheet.create inside a component body (rebuilt every render) — not a stale hazard, a perf one
  for (const m of src.matchAll(/^\s{2,}.*StyleSheet\.create\(/gm)) report.styleCreateInBody.push(`${f}: ${m[0].trim().slice(0, 60)}`);
}
for (const [k, v] of Object.entries(report)) {
  console.log(`## ${k}: ${v.length}`);
  v.slice(0, 40).forEach((x) => console.log('  ' + x));
}
