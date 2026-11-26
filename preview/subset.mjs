// Builds a standalone subset of Open Sans containing only A and é,
// writes it next to this script, and verifies it in the terminal.
//
// Run:  node preview/subset.mjs
// Then: npx serve preview   (or any static file server)
// and open http://localhost:3000/subset.html
import fs from 'node:fs';
import { openSync, create } from '../dist/node/index.js';

const CHARS = ['A', 'é'];
const OUT = new URL('./OpenSans-A-eacute.subset.ttf', import.meta.url);

const font = openSync(
  new URL('../test/data/OpenSans/OpenSans-Regular.ttf', import.meta.url),
);

const subset = font.createSubset();
for (const ch of CHARS) {
  for (const glyph of font.glyphsForString(ch)) {
    subset.includeGlyph(glyph);
  }
}

const buf = subset.encode();
fs.writeFileSync(OUT, buf);
console.log(`wrote ${OUT.pathname} (${buf.length} bytes)`);

// reopen the subset from the bytes, like any consumer would
const f = create(buf);
console.log('tables:', Object.keys(f.directory.tables).sort().join(' '));

let failed = false;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}` +
      (ok ? '' : ` (expected ${JSON.stringify(expected)})`),
  );
};

for (const ch of CHARS) {
  const got = f.glyphsForString(ch)[0];
  const want = font.glyphsForString(ch)[0];
  check(`'${ch}' advanceWidth`, got.advanceWidth, want.advanceWidth);
  check(`'${ch}' path`, got.path.toSVG(), want.path.toSVG());
  console.log(
    `     '${ch}' -> gid ${got.id}, path ${got.path.toSVG().length} chars, ` +
      `starts ${JSON.stringify(got.path.toSVG().slice(0, 15))}`,
  );
}

// characters that were not included fall back to the missing glyph
check(`'B' gid`, f.glyphsForString('B')[0].id, 0);
check(`'e' gid`, f.glyphsForString('e')[0].id, 0);
check('characterSet', f.characterSet.join(','), '65,233');
check(
  'A is not .notdef',
  f.glyphsForString('A')[0].path.toSVG() !== f.getGlyph(0).path.toSVG(),
  true,
);
check('underlinePosition', f.underlinePosition, font.underlinePosition);

console.log(
  `advance widths: A=${f.glyphsForString('A')[0].advanceWidth} é=${f.glyphsForString('é')[0].advanceWidth}`,
);
process.exit(failed ? 1 : 0);
