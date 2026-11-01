import { createHash, randomBytes, randomInt } from "node:crypto";
import { encode } from "uqr";
import { captureInSite } from "./site.ts";

/** Terminal invites live longer than "添加设备" codes: you may need to walk to the other device. */
const INVITE_TTL = 600;

export interface Invite {
  link: string;
  expiresAt: number;
}

/**
 * `markvault paste-invite` (design doc 6.3): store the hash of a one-time
 * token in D1 through wrangler. Being logged in to Cloudflare is the proof of
 * ownership, so the Worker holds no admin secret.
 */
export async function createInvite(siteUrl: string, local: boolean): Promise<Invite> {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const id = Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)]).join("");
  const expiresAt = Math.floor(Date.now() / 1000) + INVITE_TTL;
  // Every value is generated right here (hex, [a-z0-9], digits); nothing user-supplied reaches the SQL.
  const sql = `INSERT INTO pair_codes (id, token_hash, expires_at) VALUES ('${id}', '${hash}', ${expiresAt})`;
  await captureInSite("wrangler", ["d1", "execute", "markvault", local ? "--local" : "--remote", "--yes", "--command", sql]);
  return { link: `${siteUrl.replace(/\/$/, "")}/paste/pair/#t=${token}`, expiresAt };
}

/**
 * QR code for the terminal: half-block characters with explicit black-on-white
 * colours, so it scans on dark and light terminal themes alike.
 */
export function terminalQr(text: string): string {
  const { data, size } = encode(text, { border: 2, ecc: "M" });
  const lines: string[] = [];
  for (let row = 0; row < size; row += 2) {
    let line = "\x1b[38;5;16m\x1b[48;5;231m";
    for (let col = 0; col < size; col += 1) {
      const top = data[row][col];
      const bottom = row + 1 < size ? data[row + 1][col] : false;
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines.join("\n");
}
