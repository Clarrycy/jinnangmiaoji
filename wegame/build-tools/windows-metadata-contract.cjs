'use strict';

const fs = require('node:fs');
const path = require('node:path');
const toolRoots = [__dirname, process.env.JND_MICRO_TOOL_ROOT].filter(Boolean);
const { load: loadPELibrary } = require(require.resolve('pe-library/cjs', { paths: toolRoots }));
const { load: loadResEdit } = require(require.resolve('resedit/cjs', { paths: toolRoots }));

const LANGUAGE = { lang: 1033, codepage: 1200 };
const PRODUCTS = Object.freeze({
  launcher: Object.freeze({
    version: '2.1.1.0',
    strings: Object.freeze({
      CompanyName: '锦囊袋',
      FileDescription: '锦囊妙计 · 启动器',
      InternalName: 'JinnangdaiMicroClient',
      OriginalFilename: 'JinnangdaiMicroClient.exe',
      ProductName: '锦囊妙计 · 启动器',
    }),
  }),
  observer: Object.freeze({
    version: '0.2.1.0',
    strings: Object.freeze({
      CompanyName: '锦囊袋',
      FileDescription: '锦囊袋微端监听器',
      InternalName: 'JinnangdaiRuntimeObserver',
      OriginalFilename: 'JinnangdaiRuntimeObserver.exe',
      ProductName: '锦囊袋微端监听器',
    }),
  }),
});

function productFor(id) {
  if (id && typeof id === 'object' && /^\d+\.\d+\.\d+\.\d+$/.test(id.version) && id.strings?.ProductName) return id;
  const product = PRODUCTS[id];
  if (!product) throw new Error(`unknown Windows product: ${id}`);
  return product;
}

async function loadVersionInfo(exePath) {
  const [PELibrary, ResEdit] = await Promise.all([loadPELibrary(), loadResEdit()]);
  const executable = PELibrary.NtExecutable.from(fs.readFileSync(exePath));
  const resources = PELibrary.NtExecutableResource.from(executable);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  if (versions.length !== 1) throw new Error(`expected one Windows version resource, found ${versions.length}`);
  return { executable, resources, versionInfo: versions[0], ResEdit };
}

function readStringValues(versionInfo) {
  const languages = versionInfo.getAllLanguagesForStringValues();
  const language = languages.find(item => item.lang === LANGUAGE.lang && item.codepage === LANGUAGE.codepage)
    || languages[0];
  if (!language) throw new Error('Windows version string table is missing');
  return versionInfo.getStringValues(language);
}

async function readWindowsMetadata(exePath) {
  const { versionInfo } = await loadVersionInfo(exePath);
  return {
    fixedInfo: { ...versionInfo.fixedInfo },
    strings: { ...readStringValues(versionInfo) },
  };
}

async function stampWindowsMetadata(exePath, productId, iconPath = '') {
  const product = productFor(productId);
  const { executable, resources, versionInfo, ResEdit } = await loadVersionInfo(exePath);
  if (iconPath) {
    const icons = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath)).icons.map(item => item.data);
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
    if (!icons.length || !groups.length) throw new Error('Windows icon input or group is missing');
    for (const group of groups) {
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
    }
  }
  versionInfo.setFileVersion(product.version, LANGUAGE.lang);
  versionInfo.setProductVersion(product.version, LANGUAGE.lang);
  versionInfo.setStringValues(LANGUAGE, product.strings, true);
  versionInfo.outputToResourceEntries(resources.entries);
  resources.outputResource(executable);

  const tempPath = `${exePath}.metadata-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, Buffer.from(executable.generate()));
    fs.renameSync(tempPath, exePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  return verifyWindowsMetadata(exePath, productId);
}

async function verifyWindowsMetadata(exePath, productId) {
  const product = productFor(productId);
  const actual = await readWindowsMetadata(exePath);
  const expectedStrings = {
    ...product.strings,
    FileVersion: product.version,
    ProductVersion: product.version,
  };
  const mismatches = Object.entries(expectedStrings)
    .filter(([key, value]) => actual.strings[key] !== value)
    .map(([key, value]) => ({ key, expected: value, actual: actual.strings[key] }));
  if (mismatches.length) {
    throw new Error(`Windows metadata mismatch: ${JSON.stringify(mismatches)}`);
  }
  return { productId, version: product.version, strings: actual.strings };
}

async function main(argv) {
  const [command, productId, exePath] = argv;
  if (!['stamp', 'verify'].includes(command) || !productId || !exePath) {
    throw new Error('usage: node windows-metadata-contract.cjs <stamp|verify> <launcher|observer> <exe>');
  }
  const resolved = path.resolve(exePath);
  const result = command === 'stamp'
    ? await stampWindowsMetadata(resolved, productId)
    : await verifyWindowsMetadata(resolved, productId);
  console.log(`verified Windows metadata: ${result.strings.ProductName} ${result.version}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error && (error.stack || error.message) || error);
    process.exitCode = 1;
  });
}

module.exports = {
  PRODUCTS,
  readWindowsMetadata,
  stampWindowsMetadata,
  verifyWindowsMetadata,
};
