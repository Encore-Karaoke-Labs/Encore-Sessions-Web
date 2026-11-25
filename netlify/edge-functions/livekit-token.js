import { verifyToken } from "@clerk/backend";
import { AccessToken } from "livekit-server-sdk";

// Needed for apps calling fetch() from a WebView/renderer
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  const bearerToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (!bearerToken) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders },
    );
  }

  let claims;
  try {
    claims = await verifyToken(bearerToken, {
      secretKey: Netlify.env.get("CLERK_SECRET_KEY"),
    });
  } catch (error) {
    const reason = [error?.reason, error?.message]
      .filter(Boolean)
      .join(": ")
      .slice(0, 200);
    console.error("[livekit-token] Token verification failed:", reason);
    return Response.json(
      {
        error: `Invalid or expired token (${reason || "verification failed"})`,
      },
      { status: 401, headers: corsHeaders },
    );
  }

  const { roomName } = await request.json().catch(() => ({}));
  if (!roomName) {
    return Response.json(
      { error: "roomName is required" },
      { status: 400, headers: corsHeaders },
    );
  }

  const at = new AccessToken(
    Netlify.env.get("LIVEKIT_API_KEY"),
    Netlify.env.get("LIVEKIT_API_SECRET"),
    {
      identity: claims.sub,
      name: claims.username || claims.sub,
      metadata: JSON.stringify({ avatarUrl: claims.avatar || null }),
      ttl: "2h",
    },
  );

  at.addGrant({ roomJoin: true, room: String(roomName) });

  return Response.json(
    {
      token: await at.toJwt(),
      url: Netlify.env.get("LIVEKIT_URL"),
    },
    { status: 200, headers: corsHeaders },
  );
};
