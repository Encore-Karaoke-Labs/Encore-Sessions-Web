const SESSION_ID_LENGTH = 16;
const CHECKSUM_LENGTH = 4;

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4 !== 0) str += "=";
  const binary = atob(str);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function getHostNameFromCode(code) {
  try {
    const match = code.match(/^SES(\d+)-(.+)$/);
    if (!match) return null;

    const encodedPacket = match[2];
    const packet = base64urlDecode(encodedPacket);
    if (packet.length < 2 + SESSION_ID_LENGTH + CHECKSUM_LENGTH) return null;

    const payloadEnd = packet.length - CHECKSUM_LENGTH;
    const payload = packet.slice(0, payloadEnd);
    const receivedChecksum = packet.slice(payloadEnd);

    const hash = await sha256(payload);
    const expectedChecksum = hash.slice(0, CHECKSUM_LENGTH);

    for (let i = 0; i < CHECKSUM_LENGTH; i++) {
      if (receivedChecksum[i] !== expectedChecksum[i]) return null;
    }

    const nameLength = payload[1];
    const nameStart = 2;
    const nameEnd = nameStart + nameLength;

    const decoder = new TextDecoder();
    return decoder.decode(payload.slice(nameStart, nameEnd));
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async (request, context) => {
  const response = await context.next();
  const url = new URL(request.url);

  let roomCode = url.searchParams.get("room");
  if (!roomCode) {
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const joinIndex = pathSegments.indexOf("join");
    if (joinIndex !== -1 && pathSegments[joinIndex + 1]) {
      roomCode = pathSegments[joinIndex + 1];
    }
  }

  if (!roomCode) return response;

  const hostName = await getHostNameFromCode(decodeURIComponent(roomCode));
  if (!hostName) return response;

  const safeHost = escapeHtml(hostName);
  const dynamicTitle = `Join ${safeHost}'s Karaoke Session`;
  const dynamicDesc = `${safeHost} has invited you to join a remote karaoke session on Encore.`;

  let html = await response.text();

  html = html
    .replace(/<title>.*?<\/title>/i, `<title>${dynamicTitle}</title>`)
    .replace(
      /<meta property="og:title" content=".*?" \/>/i,
      `<meta property="og:title" content="${dynamicTitle}" />`,
    )
    .replace(
      /<meta property="og:description" content=".*?" \/>/i,
      `<meta property="og:description" content="${dynamicDesc}" />`,
    )
    .replace(
      /<meta name="description" content=".*?" \/>/i,
      `<meta name="description" content="${dynamicDesc}" />`,
    );

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
};

export const config = { path: ["/join", "/join/*"] };
