'use strict';

const fs = require('fs');
const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readPeResources(file) {
  const peOffset = file.readUInt32LE(0x3c);
  if (file.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('not a PE executable');
  const coffOffset = peOffset + 4;
  const sectionCount = file.readUInt16LE(coffOffset + 2);
  const optionalSize = file.readUInt16LE(coffOffset + 16);
  const optionalOffset = coffOffset + 20;
  const magic = file.readUInt16LE(optionalOffset);
  const dataDirectoryOffset = optionalOffset + (magic === 0x20b ? 112 : 96);
  const resourceRva = file.readUInt32LE(dataDirectoryOffset + 16);
  const sections = [];
  const sectionTableOffset = optionalOffset + optionalSize;
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionTableOffset + index * 40;
    sections.push({
      virtualSize: file.readUInt32LE(offset + 8),
      virtualAddress: file.readUInt32LE(offset + 12),
      rawSize: file.readUInt32LE(offset + 16),
      rawAddress: file.readUInt32LE(offset + 20),
    });
  }
  function rvaToOffset(rva) {
    const section = sections.find(item => rva >= item.virtualAddress
      && rva < item.virtualAddress + Math.max(item.virtualSize, item.rawSize));
    if (!section) throw new Error(`unmapped resource RVA ${rva.toString(16)}`);
    return section.rawAddress + rva - section.virtualAddress;
  }
  const rootOffset = rvaToOffset(resourceRva);
  function entries(directoryOffset) {
    const count = file.readUInt16LE(directoryOffset + 12) + file.readUInt16LE(directoryOffset + 14);
    return Array.from({ length: count }, (_, index) => {
      const offset = directoryOffset + 16 + index * 8;
      const name = file.readUInt32LE(offset);
      const target = file.readUInt32LE(offset + 4);
      return {
        id: name & 0x7fffffff,
        named: Boolean(name & 0x80000000),
        directory: Boolean(target & 0x80000000),
        offset: rootOffset + (target & 0x7fffffff),
      };
    });
  }
  function dataFor(entry) {
    let cursor = entry;
    while (cursor.directory) cursor = entries(cursor.offset)[0];
    const rva = file.readUInt32LE(cursor.offset);
    const size = file.readUInt32LE(cursor.offset + 4);
    const offset = rvaToOffset(rva);
    return file.subarray(offset, offset + size);
  }
  return { entries, dataFor, rootOffset };
}

function embeddedIconImages(exePath) {
  const file = fs.readFileSync(exePath);
  const resources = readPeResources(file);
  const iconType = resources.entries(resources.rootOffset).find(item => !item.named && item.id === 3);
  const groupType = resources.entries(resources.rootOffset).find(item => !item.named && item.id === 14);
  if (!iconType?.directory || !groupType?.directory) throw new Error('Windows icon resources are missing');
  const icons = new Map(resources.entries(iconType.offset)
    .filter(item => !item.named)
    .map(item => [item.id, resources.dataFor(item)]));
  const groupEntry = resources.entries(groupType.offset).find(item => !item.named);
  if (!groupEntry) throw new Error('Windows group icon resource is missing');
  const group = resources.dataFor(groupEntry);
  const count = group.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 14;
    const id = group.readUInt16LE(offset + 12);
    const image = icons.get(id);
    if (!image) throw new Error(`Windows icon image ${id} is missing`);
    return {
      width: group[offset] || 256,
      height: group[offset + 1] || 256,
      bytes: group.readUInt32LE(offset + 8),
      sha256: sha256(image),
    };
  });
}

function sourceIconImages(icoPath) {
  const file = fs.readFileSync(icoPath);
  if (file.readUInt16LE(0) !== 0 || file.readUInt16LE(2) !== 1) throw new Error('not a Windows ICO file');
  const count = file.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const bytes = file.readUInt32LE(offset + 8);
    const imageOffset = file.readUInt32LE(offset + 12);
    return {
      width: file[offset] || 256,
      height: file[offset + 1] || 256,
      bytes,
      sha256: sha256(file.subarray(imageOffset, imageOffset + bytes)),
    };
  });
}

function verifyWindowsIcon(exePath, icoPath) {
  const embedded = embeddedIconImages(exePath);
  const source = sourceIconImages(icoPath);
  const exact = embedded.length === source.length
    && embedded.every((item, index) => JSON.stringify(item) === JSON.stringify(source[index]));
  return { exact, embedded, source };
}

if (require.main === module) {
  const [exePath, icoPath] = process.argv.slice(2);
  if (!exePath || !icoPath) throw new Error('usage: node windows-icon-contract.js <exe> <ico>');
  const result = verifyWindowsIcon(exePath, icoPath);
  if (!result.exact) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`verified ${result.embedded.length} embedded icon sizes`);
  }
}

module.exports = { embeddedIconImages, sourceIconImages, verifyWindowsIcon };
