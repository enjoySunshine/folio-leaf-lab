import * as r from 'restructure';

const resolved = Promise.resolve();

export default class Subset {
  constructor(font) {
    this.font = font;
    this.glyphs = [];
    this.mapping = {};

    // maps unicode code points to glyph ids in the subset.
    // used to build the cmap table of the encoded font.
    this.cmap = {};

    // always include the missing glyph
    this.includeGlyph(0);
  }

  includeGlyph(glyph) {
    let codePoints = [];
    if (typeof glyph === 'object') {
      // a cmap can only map single code points, so ligature
      // glyphs and variation sequences are not recorded here
      if (glyph.codePoints && glyph.codePoints.length === 1) {
        codePoints = glyph.codePoints;
      }

      glyph = glyph.id;
    }

    if (this.mapping[glyph] == null) {
      this.glyphs.push(glyph);
      this.mapping[glyph] = this.glyphs.length - 1;
    }

    let id = this.mapping[glyph];
    for (let codePoint of codePoints) {
      if (this.cmap[codePoint] == null) {
        this.cmap[codePoint] = id;
      }
    }

    return id;
  }
}
