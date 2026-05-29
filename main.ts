// Single-process entrypoint: boots the dev server.
//
// Run: bun --hot main.ts
//
// Override port via env: PORT (default 3001).

await import("./dev.ts");

console.log("[main] server running");
