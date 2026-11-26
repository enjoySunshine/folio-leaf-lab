import Subset from './Subset';
import Directory from '../tables/directory';
import TTFGlyphEncoder from '../glyph/TTFGlyphEncoder';
import { encodeCmap } from './cmap';

export default class TTFSubset extends Subset {
  constructor(font) {
    super(font);
    this.glyphEncoder = new TTFGlyphEncoder();
  }

  _addGlyph(gid) {
    let glyph = this.font.getGlyph(gid);
    let glyf = glyph._decode();

    // get the offset to the glyph from the loca table
    let curOffset = this.font.loca.offsets[gid];
    let nextOffset = this.font.loca.offsets[gid + 1];

    let stream = this.font._getTableStream('glyf');
    stream.pos += curOffset;

    let buffer = stream.readBuffer(nextOffset - curOffset);

    let bearing = glyph._getMetrics().leftBearing;
    if (glyf && this.font._variationProcessor) {
      // If this is a TrueType variation glyph, re-encode the path and take the
      // left side bearing from it. Compound glyphs are flattened too, as the
      // offsets of their components vary.
      buffer = this.glyphEncoder.encodeSimple(glyph.path, glyf.instructions);
      bearing = glyph.path.cbox.minX;
    } else if (glyf && glyf.numberOfContours < 0) {
      // if it is a compound glyph, include its components
      buffer = new Uint8Array(buffer);
      let view = new DataView(buffer.buffer);
      for (let component of glyf.components) {
        gid = this.includeGlyph(component.glyphID);
        view.setUint16(component.pos, gid);
      }
    }

    this.glyf.push(buffer);
    this.loca.offsets.push(this.offset);

    this.hmtx.metrics.push({
      advance: glyph.advanceWidth,
      bearing,
    });

    this.offset += buffer.length;
    return this.glyf.length - 1;
  }

  encode() {
    // tables required by PDF spec:
    //   head, hhea, loca, maxp, cvt , prep, glyf, hmtx, fpgm
    //
    // additional tables required for standalone fonts:
    //   cmap, name, OS/2, post

    this.glyf = [];
    this.offset = 0;
    this.loca = {
      offsets: [],
      version: this.font.loca.version,
    };

    this.hmtx = {
      metrics: [],
      bearings: [],
    };

    // include all the glyphs
    // not using a for loop because we need to support adding more
    // glyphs to the array as we go, and CoffeeScript caches the length.
    let i = 0;
    while (i < this.glyphs.length) {
      this._addGlyph(this.glyphs[i++]);
    }

    let maxp = { ...this.font.maxp };
    maxp.numGlyphs = this.glyf.length;

    this.loca.offsets.push(this.offset);

    let head = { ...this.font.head };
    head.indexToLocFormat = this.loca.version;

    let hhea = { ...this.font.hhea };
    hhea.numberOfMetrics = this.hmtx.metrics.length;

    // map the included characters to their glyphs, so the subset
    // can be opened and used as a standalone font
    let cmap = encodeCmap(this.cmap);

    let name = this.font.name ? { ...this.font.name } : undefined;

    let os2 = this.font['OS/2'] ? { ...this.font['OS/2'] } : undefined;
    if (os2) {
      // clamp the encoded character range to the subset
      let codePoints = Object.keys(this.cmap).map(Number);
      os2.usFirstCharIndex = codePoints.length
        ? Math.min(Math.min(...codePoints), 0xffff)
        : 0;
      os2.usLastCharIndex = codePoints.length
        ? Math.min(Math.max(...codePoints), 0xffff)
        : 0;
    }

    // a post table without glyph names
    let post = this.font.post
      ? {
          version: 3,
          italicAngle: this.font.post.italicAngle,
          underlinePosition: this.font.post.underlinePosition,
          underlineThickness: this.font.post.underlineThickness,
          isFixedPitch: this.font.post.isFixedPitch,
          minMemType42: 0,
          maxMemType42: 0,
          minMemType1: 0,
          maxMemType1: 0,
        }
      : undefined;

    // TODO: subset prep, cvt, fpgm?
    return Directory.toBuffer({
      tables: {
        cmap,
        head,
        hhea,
        loca: this.loca,
        maxp,
        'cvt ': this.font['cvt '],
        prep: this.font.prep,
        glyf: this.glyf,
        hmtx: this.hmtx,
        fpgm: this.font.fpgm,
        name,
        'OS/2': os2,
        post,
      },
    });
  }
}
