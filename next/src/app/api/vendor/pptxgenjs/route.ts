import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const bundlePath = join(
    process.cwd(),
    "node_modules",
    "pptxgenjs",
    "dist",
    "pptxgen.bundle.js",
  );
  const source = await readFile(bundlePath, "utf8");

  return new NextResponse(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
