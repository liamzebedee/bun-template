// Static export.
//
//   bun framework/build.ts      # bundles the SPA into ./dist as plain HTML/JS/CSS
//
// The output is fully static. (The /api/items store needs the dev server; a
// purely static dist/ has no backend.)
const ROOT = `${import.meta.dir}/..`; // project root (this file lives in framework/)
const OUT = `${ROOT}/dist`;

const result = await Bun.build({
  entrypoints: [`${ROOT}/app/index.tsx`],
  outdir: OUT,
  minify: true,
});
if (!result.success) {
  console.error(result.logs.join("\n"));
  process.exit(1);
}

const html = (await Bun.file(`${ROOT}/app/index.html`).text())
  .replace("/app/index.tsx", "/index.js")
  .replace("/app/index.css", "/index.css");
await Bun.write(`${OUT}/index.html`, html);
await Bun.write(`${OUT}/index.css`, Bun.file(`${ROOT}/app/index.css`));

console.log(`built → ${OUT}`);
