// Encodes a cmap table from a map of unicode code points to glyph ids.
// Always emits a Windows Unicode BMP (format 4) subtable, and additionally
// a full repertoire (format 12) subtable when a code point is outside the BMP.
export function encodeCmap(mapping) {
  let entries = Object.keys(mapping)
    .map((codePoint) => [Number(codePoint), mapping[codePoint]])
    .sort((a, b) => a[0] - b[0]);

  let subtables = [];
  let bmp = entries.filter(([codePoint]) => codePoint <= 0xffff);
  subtables.push({ platformID: 3, encodingID: 1, buffer: encodeFormat4(bmp) });

  if (bmp.length < entries.length) {
    subtables.push({
      platformID: 3,
      encodingID: 10,
      buffer: encodeFormat12(entries),
    });
  }

  let size = 4 + subtables.length * 8;
  for (let subtable of subtables) {
    size += subtable.buffer.length;
  }

  let buffer = new Uint8Array(size);
  let view = new DataView(buffer.buffer);

  view.setUint16(0, 0); // version
  view.setUint16(2, subtables.length);

  let offset = 4 + subtables.length * 8;
  subtables.forEach((subtable, i) => {
    view.setUint16(4 + i * 8, subtable.platformID);
    view.setUint16(6 + i * 8, subtable.encodingID);
    view.setUint32(8 + i * 8, offset);
    buffer.set(subtable.buffer, offset);
    offset += subtable.buffer.length;
  });

  return buffer;
}

// Format 4: segment mapping to delta values. Segments are encoded with a
// zero idRangeOffset, so no glyphIndexArray is needed.
function encodeFormat4(entries) {
  // merge consecutive code points with a constant delta into segments
  let segments = [];
  for (let [codePoint, gid] of entries) {
    let delta = (gid - codePoint) & 0xffff;
    let last = segments[segments.length - 1];
    if (last && codePoint === last.end + 1 && last.delta === delta) {
      last.end = codePoint;
    } else {
      segments.push({ start: codePoint, end: codePoint, delta });
    }
  }

  // required terminator segment, mapping 0xffff to the missing glyph
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });

  let segCount = segments.length;
  let maxPowerOf2 = Math.pow(2, Math.floor(Math.log2(segCount)));

  let length = 16 + segCount * 8;
  let buffer = new Uint8Array(length);
  let view = new DataView(buffer.buffer);

  view.setUint16(0, 4); // format
  view.setUint16(2, length);
  view.setUint16(4, 0); // language
  view.setUint16(6, segCount * 2);
  view.setUint16(8, maxPowerOf2 * 2); // searchRange
  view.setUint16(10, Math.log2(maxPowerOf2)); // entrySelector
  view.setUint16(12, segCount * 2 - maxPowerOf2 * 2); // rangeShift

  let pos = 14;
  for (let segment of segments) {
    view.setUint16(pos, segment.end);
    pos += 2;
  }

  view.setUint16(pos, 0); // reservedPad
  pos += 2;

  for (let segment of segments) {
    view.setUint16(pos, segment.start);
    pos += 2;
  }

  for (let segment of segments) {
    view.setUint16(pos, segment.delta);
    pos += 2;
  }

  // idRangeOffset is zero for all segments
  for (let i = 0; i < segCount; i++) {
    view.setUint16(pos, 0);
    pos += 2;
  }

  return buffer;
}

// Format 12: segmented coverage of the full unicode repertoire
function encodeFormat12(entries) {
  // merge consecutive code points with consecutive glyph ids into groups
  let groups = [];
  for (let [codePoint, gid] of entries) {
    let last = groups[groups.length - 1];
    if (
      last &&
      codePoint === last.end + 1 &&
      gid === last.startGID + (codePoint - last.start)
    ) {
      last.end = codePoint;
    } else {
      groups.push({ start: codePoint, end: codePoint, startGID: gid });
    }
  }

  let length = 16 + groups.length * 12;
  let buffer = new Uint8Array(length);
  let view = new DataView(buffer.buffer);

  view.setUint16(0, 12); // format
  view.setUint16(2, 0); // reserved
  view.setUint32(4, length);
  view.setUint32(8, 0); // language
  view.setUint32(12, groups.length);

  let pos = 16;
  for (let group of groups) {
    view.setUint32(pos, group.start);
    view.setUint32(pos + 4, group.end);
    view.setUint32(pos + 8, group.startGID);
    pos += 12;
  }

  return buffer;
}
