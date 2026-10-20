// Fails when a Pressable/TouchableOpacity has no text inside and no
// accessibilityLabel, so VoiceOver reads it as just "button".
// Run: node --experimental-strip-types --test tests/unit/icon-only-pressable-a11y.test.mjs
//
// Icon-only buttons shipped unlabeled across the tabs: the Lists back and
// "more" buttons, the drag handle, remove buttons, the sort/grid/list toggles
// on Watched and To Watch, and the photo-wall tiles. A button whose only child
// is an <Svg>/<Ionicons>/<Image> needs an accessibilityLabel (or
// accessible={false} when a parent already speaks for it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIRS = ['app', 'components'];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

// Something inside the button VoiceOver can read, or a prop/children passed
// through from the caller (checked at that caller instead).
const SPEAKS = /<Text\b|<ThemedText\b|\{children\}|<StarRating\b|\blabel\b/;
const LABELLED = /accessibilityLabel|aria-label|accessible=\{false\}/;
// A lone `{inner}`-style variable: the content is built elsewhere in the
// file, so this scan cannot see whether it has text. Skipped, not flagged.
const OPAQUE_ONLY = /^\s*\{\s*[A-Za-z_$][\w$]*\s*\}\s*$/;

/** Returns [{line, tag}] for each unlabeled button whose children have no text. */
export function findUnlabeledIconButtons(src) {
  const hits = [];
  const re = /<(Pressable|TouchableOpacity)\b/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let selfClose = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { selfClose = src[i - 1] === '/'; break; }
    }
    const attrs = src.slice(m.index, i + 1);
    if (LABELLED.test(attrs)) continue;
    const tag = m[1];
    let end = i + 1;
    if (!selfClose) {
      const nestRe = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
      nestRe.lastIndex = i + 1;
      let nest = 1;
      let mm;
      while ((mm = nestRe.exec(src))) {
        if (mm[0].startsWith('</')) {
          if (--nest === 0) { end = mm.index; break; }
        } else nest++;
      }
    }
    const children = selfClose ? '' : src.slice(i + 1, end);
    if (SPEAKS.test(children) || OPAQUE_ONLY.test(children)) continue;
    hits.push({ line: src.slice(0, m.index).split('\n').length, tag });
  }
  return hits;
}

test('every icon-only button has an accessibilityLabel', () => {
  const hits = [];
  for (const d of DIRS) {
    for (const file of walk(join(ROOT, d), [])) {
      const rel = relative(ROOT, file).split('\\').join('/');
      for (const h of findUnlabeledIconButtons(readFileSync(file, 'utf8'))) {
        hits.push(`${rel}:${h.line} <${h.tag}>`);
      }
    }
  }
  assert.deepEqual(hits, [], `Add accessibilityLabel (and accessibilityRole) to:\n${hits.join('\n')}`);
});

test('the scan catches the shapes that shipped and skips labelled ones', () => {
  const iconOnly = `<Pressable onPress={go} style={s.btn}>\n  <Ionicons name="ellipsis-horizontal" size={20} />\n</Pressable>`;
  assert.equal(findUnlabeledIconButtons(iconOnly).length, 1);
  const selfClosing = `<TouchableOpacity onPress={() => x()} />`;
  assert.equal(findUnlabeledIconButtons(selfClosing).length, 1);
  const labelled = `<Pressable accessibilityLabel="List options" onPress={go}><Ionicons name="x" /></Pressable>`;
  assert.equal(findUnlabeledIconButtons(labelled).length, 0);
  const withText = `<Pressable onPress={go}><Ionicons name="add" /><Text>Add</Text></Pressable>`;
  assert.equal(findUnlabeledIconButtons(withText).length, 0);
  const arrowInProp = `<Pressable style={({ pressed }) => [s.a, pressed && s.b]} onPress={go}><Svg /></Pressable>`;
  assert.equal(findUnlabeledIconButtons(arrowInProp).length, 1);
  assert.equal(findUnlabeledIconButtons(`<Pressable onPress={go}>{inner}</Pressable>`).length, 0);
});
