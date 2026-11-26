/**
 * Zero-dependency standard ZIP archive builder (PKZIP 2.0 STORE method + IEEE 802.3 CRC32).
 * 100% compatible with Windows Explorer, macOS Archive Utility, 7-Zip, and Bambu Studio.
 */

export interface ZipEntryInput {
  filename: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Packs one or more files into a valid binary ZIP ArrayBuffer. */
export function buildZipArchive(entries: ZipEntryInput[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const prepared = entries.map((e) => {
    const nameBytes = encoder.encode(e.filename);
    const crc = crc32(e.data);
    return { nameBytes, data: e.data, crc };
  });

  // Compute total byte size
  let localSectionSize = 0;
  let centralSectionSize = 0;
  for (const item of prepared) {
    localSectionSize += 30 + item.nameBytes.length + item.data.length;
    centralSectionSize += 46 + item.nameBytes.length;
  }
  const totalSize = localSectionSize + centralSectionSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  const offsets: number[] = [];
  let cursor = 0;

  // 1. Local file headers + payloads
  for (const item of prepared) {
    offsets.push(cursor);
    view.setUint32(cursor + 0, 0x04034b50, true); // Local file header signature
    view.setUint16(cursor + 4, 20, true); // Version needed (2.0)
    view.setUint16(cursor + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(cursor + 8, 0, true); // Compression: STORE (0)
    view.setUint16(cursor + 10, 0, true); // Mod time
    view.setUint16(cursor + 12, 0x5421, true); // Mod date
    view.setUint32(cursor + 14, item.crc, true);
    view.setUint32(cursor + 18, item.data.length, true); // Compressed size
    view.setUint32(cursor + 22, item.data.length, true); // Uncompressed size
    view.setUint16(cursor + 26, item.nameBytes.length, true);
    view.setUint16(cursor + 28, 0, true); // Extra field len
    cursor += 30;
    out.set(item.nameBytes, cursor);
    cursor += item.nameBytes.length;
    out.set(item.data, cursor);
    cursor += item.data.length;
  }

  const centralStart = cursor;

  // 2. Central directory records
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    view.setUint32(cursor + 0, 0x02014b50, true); // Central directory signature
    view.setUint16(cursor + 4, 20, true); // Version made by
    view.setUint16(cursor + 6, 20, true); // Version needed
    view.setUint16(cursor + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(cursor + 10, 0, true); // STORE
    view.setUint16(cursor + 12, 0, true);
    view.setUint16(cursor + 14, 0x5421, true);
    view.setUint32(cursor + 16, item.crc, true);
    view.setUint32(cursor + 20, item.data.length, true);
    view.setUint32(cursor + 24, item.data.length, true);
    view.setUint16(cursor + 28, item.nameBytes.length, true);
    view.setUint16(cursor + 30, 0, true); // Extra len
    view.setUint16(cursor + 32, 0, true); // Comment len
    view.setUint16(cursor + 34, 0, true); // Disk start
    view.setUint16(cursor + 36, 0, true); // Internal attrs
    view.setUint32(cursor + 38, 0, true); // External attrs
    view.setUint32(cursor + 42, offsets[i], true);
    cursor += 46;
    out.set(item.nameBytes, cursor);
    cursor += item.nameBytes.length;
  }

  // 3. End of Central Directory record
  view.setUint32(cursor + 0, 0x06054b50, true);
  view.setUint16(cursor + 4, 0, true);
  view.setUint16(cursor + 6, 0, true);
  view.setUint16(cursor + 8, prepared.length, true);
  view.setUint16(cursor + 10, prepared.length, true);
  view.setUint32(cursor + 12, centralSectionSize, true);
  view.setUint32(cursor + 16, centralStart, true);
  view.setUint16(cursor + 20, 0, true);

  return out.buffer;
}
