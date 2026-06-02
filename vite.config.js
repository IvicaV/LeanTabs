import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import path from "path";
import fs from "fs";

const copyIconsPlugin = () => ({
  name: "copy-icons",
  closeBundle() {
    const srcDir = path.resolve(__dirname, "src");
    const distDir = path.resolve(__dirname, "dist");
    
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    const icons = ["icon16.png", "icon48.png", "icon128.png"];
    for (const icon of icons) {
      const srcPath = path.join(srcDir, icon);
      const distPath = path.join(distDir, icon);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, distPath);
      }
    }
  }
});

export default defineConfig({
  root: "src",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  plugins: [
    webExtension({
      manifest: "manifest.json",
      disableAutoLaunch: true,
      additionalInputs: [
        "saved-links.html",
        "theme.js"
      ],
    }),
    copyIconsPlugin(),
  ],
});

