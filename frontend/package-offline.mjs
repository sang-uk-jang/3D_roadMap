import { mkdir, readFile, writeFile } from "node:fs/promises";

const dist = new URL("./dist/", import.meta.url);
const output = new URL("../artifacts/guide/", import.meta.url);
const input = await readFile(new URL("index.html", dist), "utf-8");
const jsTag = /<script type="module" crossorigin src="(?<path>[^"]+)"><\/script>/;
const cssTag = /<link rel="stylesheet" crossorigin href="(?<path>[^"]+)">/;
const read = (path, encoding) => readFile(new URL(path.replace(/^\//, ""), dist), encoding);
const [code, style, ...files] = await Promise.all([
  read(input.match(jsTag).groups.path, "utf-8"),
  read(input.match(cssTag).groups.path, "utf-8"),
  ...[
    ["gunja-guide.glb", "model/gltf-binary"],
    ["navigation.json", "application/json"],
    ["gunja-map.png", "image/png"],
  ].map(async ([name, type]) => [name, { type, data: (await read(name)).toString("base64") }]),
]);
const loader = `<script>
  const assets = ${JSON.stringify(Object.fromEntries(files))};
  const urls = new Map();
  globalThis.metroLensAsset = name => {
    if (!assets[name]) return undefined;
    if (!urls.has(name)) {
      const {data,type} = assets[name];
      const decoded = atob(data);
      const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
      urls.set(name, URL.createObjectURL(new Blob([bytes], {type})));
    }
    return urls.get(name);
  };
</script>`;
const html = input.replace(jsTag, () => loader + `<script type="module">${code.replace(/<\/script/gi, "<\\/script")}</script>`)
  .replace(cssTag, () => `<style>${style}</style>`);
await mkdir(output, { recursive: true });
await writeFile(new URL("gunja-route-guide.html", output), html);
