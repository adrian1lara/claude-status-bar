module.exports = {
  appId: "com.adrianlara.claude-usage-bar",
  productName: "Claude Usage Bar",
  directories: {
    output: "dist"
  },
  asar: true,
  files: [
    "main.js",
    "preload.js",
    "claude-session.js",
    "renderer/**/*",
    "assets/app-icon.png",
    "assets/app-icon.icns",
    "package.json",
    // Exclude unnecessary files from the bundle
    "!**/*.map",
    "!**/*.md",
    "!**/test/**",
    "!**/tests/**",
    "!**/.DS_Store",
    "!**/assets/generate-icon.js",
    "!**/assets/claude-icon.png"
  ],
  mac: {
    category: "public.app-category.developer-tools",
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    icon: "build/icon.icns",
    extendInfo: {
      LSUIElement: 1
    },
    darkModeSupport: true
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build/icon.png"
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
};
