import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZipArchive } from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json to get version
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const version = packageJson.version || "1.0.0";
const zipFileName = `leantabs-v${version}.zip`;
const outputFilePath = path.join(__dirname, zipFileName);

// Create write stream
const output = fs.createWriteStream(outputFilePath);
const archive = new ZipArchive({
  zlib: { level: 9 } // Maximum compression
});

output.on("close", () => {
  console.log(`\n🎉 Success! Extension has been zipped into: ${zipFileName}`);
  console.log(`📊 Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
});

archive.on("warning", (err) => {
  if (err.code === "ENOENT") {
    console.warn("Warning:", err);
  } else {
    throw err;
  }
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

// Append files from dist directory
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  console.error('Error: "dist" directory not found. Please run "npm run build" first.');
  process.exit(1);
}

archive.directory(distDir, false);

console.log("📦 Zipping build files...");
archive.finalize();
