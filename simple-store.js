const fs = require("fs");
const path = require("path");
const os = require("os");
const { app } = require("electron");

class SimpleStore {
  constructor({ name, defaults = {} }) {
    this._name = name;
    this._defaults = defaults;
    this._filePath = null; // resolved lazily so app.getPath() is safe to call
  }

  // Lazy path resolution — app.getPath('userData') is available even before
  // whenReady() in recent Electron versions, but we fall back to os.tmpdir()
  // in case it isn't (e.g. very early requires in unusual test contexts).
  _getPath() {
    if (this._filePath) return this._filePath;
    let dir;
    try {
      dir = app.getPath("userData");
    } catch {
      dir = os.tmpdir();
    }
    this._filePath = path.join(dir, `${this._name}.json`);
    return this._filePath;
  }

  _read() {
    try {
      const raw = fs.readFileSync(this._getPath(), "utf8");
      return { ...this._defaults, ...JSON.parse(raw) };
    } catch {
      // File missing or corrupt — fall back to defaults.
      return { ...this._defaults };
    }
  }

  _write(data) {
    const filePath = this._getPath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    } catch {}
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  get(key) {
    return this._read()[key];
  }

  set(key, value) {
    const data = this._read();
    data[key] = value;
    this._write(data);
  }
}

module.exports = SimpleStore;
