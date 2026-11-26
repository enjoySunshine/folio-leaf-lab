import * as r from 'restructure';
import Tables from './';

let TableEntry = new r.Struct({
  tag: new r.String(4),
  checkSum: r.uint32,
  offset: new r.Pointer(r.uint32, 'void', { type: 'global' }),
  length: r.uint32,
});

let Directory = new r.Struct({
  tag: new r.String(4),
  numTables: r.uint16,
  searchRange: r.uint16,
  entrySelector: r.uint16,
  rangeShift: r.uint16,
  tables: new r.Array(TableEntry, 'numTables'),
});

Directory.process = function () {
  let tables = {};
  for (let table of this.tables) {
    tables[table.tag] = table;
  }

  this.tables = tables;
};

// used for tables that are already encoded, e.g. the cmap built by a subset
const RawTable = new r.Buffer();

// wraps a table type so its data is padded to a 4 byte boundary
const align = (type) => ({
  size(val, ctx) {
    let size = type.size(val, ctx);
    return size + ((4 - (size & 3)) & 3);
  },

  encode(stream, val, ctx) {
    type.encode(stream, val, ctx);
    let padding = (4 - (stream.pos & 3)) & 3;
    while (padding--) {
      stream.writeUInt8(0);
    }
  },
});

Directory.preEncode = function () {
  if (!Array.isArray(this.tables)) {
    let tables = [];
    for (let tag in this.tables) {
      let table = this.tables[tag];
      if (table) {
        let type = table instanceof Uint8Array ? RawTable : Tables[tag];
        tables.push({
          tag: tag,
          checkSum: 0,
          offset: new r.VoidPointer(align(type), table),
          length: type.size(table),
        });
      }
    }

    // directory entries are sorted by tag per the spec
    tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    this.tables = tables;
  }

  this.tag = 'true';
  this.numTables = this.tables.length;

  let maxExponentFor2 = Math.floor(Math.log(this.numTables) / Math.LN2);
  let maxPowerOf2 = Math.pow(2, maxExponentFor2);

  this.searchRange = maxPowerOf2 * 16;
  this.entrySelector = Math.log(maxPowerOf2) / Math.LN2;
  this.rangeShift = this.numTables * 16 - this.searchRange;
};

// computes the checksum of a table, padded with zero bytes to a 4 byte multiple
function checkSum(buffer, offset, length) {
  let sum = 0;
  for (let i = 0; i < length; i += 4) {
    let value = 0;
    for (let j = 0; j < 4 && i + j < length; j++) {
      value = value * 256 + buffer[offset + i + j];
    }

    sum = (sum + value) >>> 0;
  }

  return sum;
}

// fills in the table checksums and the head table's checkSumAdjustment
// of an encoded font directory
function fixCheckSums(buffer) {
  let view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let numTables = view.getUint16(4);
  let headOffset = null;

  for (let i = 0; i < numTables; i++) {
    let entry = 12 + i * 16;
    let tag = String.fromCharCode(
      buffer[entry],
      buffer[entry + 1],
      buffer[entry + 2],
      buffer[entry + 3],
    );
    let offset = view.getUint32(entry + 8);
    let length = view.getUint32(entry + 12);

    if (tag === 'head') {
      // the checkSumAdjustment field is treated as zero for checksums
      headOffset = offset;
      view.setUint32(offset + 8, 0);
    }

    view.setUint32(entry + 4, checkSum(buffer, offset, length));
  }

  if (headOffset != null) {
    let adjustment = (0xb1b0afba - checkSum(buffer, 0, buffer.length)) >>> 0;
    view.setUint32(headOffset + 8, adjustment);
  }
}

const toBuffer = Directory.toBuffer;
Directory.toBuffer = function (val) {
  let buffer = toBuffer.call(this, val);
  fixCheckSums(buffer);
  return buffer;
};

export default Directory;
