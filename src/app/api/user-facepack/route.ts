import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildFacepackPaths(userId: string): string[] {
  const cwd = process.cwd();
  const fileName = `${userId}.png`;
  return [
    path.join(cwd, "src", "data", "user_facepack", fileName),
    path.join(cwd, "data", "user_facepack", fileName),
    path.join(cwd, "user_facepack", fileName),
  ];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = String(url.searchParams.get("user_id") || "").trim();
    if (!/^user_\d{5}$/.test(userId)) {
      return new Response("Bad Request", { status: 400 });
    }

    let filePath: string | null = null;
    for (const p of buildFacepackPaths(userId)) {
      try {
        await fs.access(p);
        filePath = p;
        break;
      } catch {}
    }
    if (!filePath) {
      return new Response("Not Found", { status: 404 });
    }

    const buf = await fs.readFile(filePath);
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 });
  }
}



