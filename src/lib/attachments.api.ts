import { getPostgresClient } from "@/lib/infra/postgres/client";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

function parseCookieString(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    if (name) {
      try {
        cookies[name] = decodeURIComponent(rest.join("="));
      } catch {
        cookies[name] = rest.join("=");
      }
    }
  });
  return cookies;
}

async function authenticateRequest(request: Request): Promise<{ userId: string } | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;

  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getClaims(token);
      if (!error && data?.claims?.sub) {
        return { userId: data.claims.sub };
      }
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (!userError && userData?.user?.id) {
        return { userId: userData.user.id };
      }
    }
  }

  // 2. Cookie session
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookieString(cookieHeader);
  if (Object.keys(cookies).length > 0) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
        setAll: () => {},
      },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user?.id) {
      return { userId: user.id };
    }
  }

  return null;
}

export async function handleAttachmentApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/attachments\/([0-9a-fA-F-]{36})$/);
  if (!match) {
    return new Response(JSON.stringify({ error: "Invalid attachment ID format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const attachmentId = match[1];
  const user = await authenticateRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getPostgresClient();

  if (request.method === "PUT") {
    try {
      const attachments = await db`
        SELECT uploader_id, status, file_size
        FROM public.attachments
        WHERE id = ${attachmentId}
      `;
      if (!attachments.length) {
        return new Response(JSON.stringify({ error: "Attachment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      const att = attachments[0];

      if (att.uploader_id !== user.userId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (att.status !== "pending") {
        return new Response(JSON.stringify({ error: "Attachment is not pending" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const buffer = await request.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        return new Response(JSON.stringify({ error: "Empty file body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const bytea = Buffer.from(buffer);
      await db`
        UPDATE public.attachments
        SET file_data = ${bytea}
        WHERE id = ${attachmentId}
      `;

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Attachment PUT Error]", err);
      return new Response(JSON.stringify({ error: "Failed to save attachment binary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (request.method === "GET") {
    try {
      const attachments = await db`
        SELECT conversation_id, mime_type, file_data, status, original_filename
        FROM public.attachments
        WHERE id = ${attachmentId}
      `;
      if (!attachments.length) {
        return new Response(JSON.stringify({ error: "Attachment not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      const att = attachments[0];

      const members = await db`
        SELECT true
        FROM public.conversation_members
        WHERE conversation_id = ${att.conversation_id} AND user_id = ${user.userId}
      `;
      if (!members.length) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (att.status !== "attached" && att.status !== "uploaded") {
        return new Response(JSON.stringify({ error: "Attachment not available" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!att.file_data) {
        return new Response(JSON.stringify({ error: "Attachment binary data missing" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(att.file_data, {
        status: 200,
        headers: {
          "Content-Type": att.mime_type || "application/octet-stream",
          "Cache-Control": "private, max-age=31536000, immutable",
          "Content-Disposition": `inline; filename="${encodeURIComponent(att.original_filename || "attachment")}"`,
        },
      });
    } catch (err) {
      console.error("[Attachment GET Error]", err);
      return new Response(JSON.stringify({ error: "Failed to read attachment binary" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}
