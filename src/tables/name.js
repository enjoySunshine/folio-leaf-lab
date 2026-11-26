import * as r from 'restructure';
import { getEncoding, LANGUAGES } from '../encodings';

let NameRecord = new r.Struct({
  platformID: r.uint16,
  encodingID: r.uint16,
  languageID: r.uint16,
  nameID: r.uint16,
  length: r.uint16,
  string: new r.Pointer(
    r.uint16,
    new r.String('length', (t) =>
      getEncoding(t.platformID, t.encodingID, t.languageID),
    ),
    {
      type: 'parent',
      // on decode, ctx is the record struct whose parent is the name table;
      // on encode, ctx is a record value built by preEncode below, which
      // carries the table's stringOffset on itself
      relativeTo: (ctx) => (ctx.parent ? ctx.parent : ctx).stringOffset,
      allowNull: false,
    },
  ),
});

let LangTagRecord = new r.Struct({
  length: r.uint16,
  tag: new r.Pointer(r.uint16, new r.String('length', 'utf16be'), {
    type: 'parent',
    relativeTo: (ctx) => ctx.stringOffset,
  }),
});

var NameTable = new r.VersionedStruct(r.uint16, {
  0: {
    count: r.uint16,
    stringOffset: r.uint16,
    records: new r.Array(NameRecord, 'count'),
  },
  1: {
    count: r.uint16,
    stringOffset: r.uint16,
    records: new r.Array(NameRecord, 'count'),
    langTagCount: r.uint16,
    langTags: new r.Array(LangTagRecord, 'langTagCount'),
  },
});

export default NameTable;

const NAMES = [
  'copyright',
  'fontFamily',
  'fontSubfamily',
  'uniqueSubfamily',
  'fullName',
  'version',
  'postscriptName', // Note: A font may have only one PostScript name and that name must be ASCII.
  'trademark',
  'manufacturer',
  'designer',
  'description',
  'vendorURL',
  'designerURL',
  'license',
  'licenseURL',
  null, // reserved
  'preferredFamily',
  'preferredSubfamily',
  'compatibleFull',
  'sampleText',
  'postscriptCIDFontName',
  'wwsFamilyName',
  'wwsSubfamilyName',
];

NameTable.process = function (stream) {
  let records = {};

  for (let record of this.records) {
    // find out what language this is for
    let language = LANGUAGES[record.platformID][record.languageID];

    if (
      language == null &&
      this.langTags != null &&
      record.languageID >= 0x8000
    ) {
      language = this.langTags[record.languageID - 0x8000].tag;
    }

    if (language == null) {
      language = record.platformID + '-' + record.languageID;
    }

    // if the nameID is >= 256, it is a font feature record (AAT)
    let key =
      record.nameID >= 256
        ? 'fontFeatures'
        : NAMES[record.nameID] || record.nameID;

    let addRecord = (key, record) => {
      if (records[key] == null) {
        records[key] = {};
      }

      let obj = records[key];
      if (key === 'fontFeatures') {
        obj = obj[record.nameID] || (obj[record.nameID] = {});
      }

      if (
        typeof record.string === 'string' ||
        typeof obj[language] !== 'string'
      ) {
        obj[language] = record.string;
      }
    };

    addRecord(key, record);

    // if the nameID is 2 or 17, it may also be a font feature record (AAT).
    if (record.nameID == 2 || record.nameID == 17) {
      addRecord('fontFeatures', record);
    }
  }

  this.records = records;
};

NameTable.preEncode = function () {
  if (Array.isArray(this.records)) return;
  this.version = 0;

  let records = [];
  for (let key in this.records) {
    let val = this.records[key];
    if (key === 'fontFeatures') continue;

    let nameID = NAMES.indexOf(key);
    if (nameID === -1) {
      // keep records with numeric name ids, skip anything unknown
      if (!/^\d+$/.test(key)) continue;
      nameID = Number(key);
    }

    let string = val.en != null ? val.en : val[Object.keys(val)[0]];
    if (typeof string !== 'string') continue;

    records.push({
      platformID: 3,
      encodingID: 1,
      languageID: 0x409,
      nameID,
      length: string.length * 2,
      string,
    });
  }

  this.records = records;
  this.count = records.length;
  this.stringOffset = NameTable.size(this, null, false);

  // the string pointers of the records are relative to this offset,
  // see the relativeTo getter of the name record struct
  for (let record of records) {
    record.stringOffset = this.stringOffset;
  }
};
