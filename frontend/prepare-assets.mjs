import { copyFile, mkdir } from "node:fs/promises";

const output = new URL("./public/", import.meta.url);
await mkdir(output, { recursive: true });
await Promise.all([
  ["models/gunja-guide.glb", "gunja-guide.glb"],
  ["navigation/navigation.json", "navigation.json"],
  ["previews/gunja-guide-map.png", "gunja-map.png"],
].map(([source, target]) => copyFile(
  new URL(`../artifacts/${source}`, import.meta.url), new URL(target, output)
)));
