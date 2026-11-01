const fs = require("node:fs");

const tag = process.env.RELEASE_TAG || "";
const version = tag.slice(1);
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const tauri = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const cargo = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (!tag.startsWith("v") || !semver.test(version)) {
  throw new Error(`Invalid release tag: ${tag}. Use a tag such as v0.2.7.`);
}

for (const [file, actual] of Object.entries({
  "package.json": packageJson.version,
  "package-lock.json": packageLock.version,
  "package-lock.json root package": packageLock.packages?.[""].version,
  "src-tauri/tauri.conf.json": tauri.version,
  "src-tauri/Cargo.toml": cargoVersion,
})) {
  if (actual !== version) {
    throw new Error(`${file} version ${actual} does not match ${tag}`);
  }
}

console.log(`Release version ${version} matches ${tag}.`);
