// Minimal helper: generates a tiny placeholder claude-icon.png if missing.
// Run with: node assets/generate-icon.js
// You can replace assets/claude-icon.png with your real 16x16 / 32x32 template image.
const fs = require("fs");
const path = require("path");
// 16x16 transparent PNG with a filled circle in the center (template-friendly black)
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAVUlEQVR4Ae3UMQoAIAhA0e7/0qRq" +
  "kqDFNzgI+oFROEiSJEmSJEmSJEmSJEmSJOlPTbVtBwAAAABJRU5ErkJggg==",
  "base64"
);
fs.writeFileSync(path.join(__dirname, "claude-icon.png"), png);
console.log("wrote", path.join(__dirname, "claude-icon.png"));
