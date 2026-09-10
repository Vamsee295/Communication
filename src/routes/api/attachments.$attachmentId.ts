import { createAPIFileRoute } from "@tanstack/react-start/api";
import { getPostgresClient } from "@/lib/infra/postgres/client";
import { parseCookies } from "vinxi/http";
import { createServerClient } from "@supabase/ssr";

export const APIRoute = createAPIFileRoute("/api/attachments/$attachmentId")({
  GET: async ({ request, params }) => {
    try {
      const cookies = parseCookies();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !supabaseKey) return new Response("Server configuration error", { status: 500 });
      
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
          setAll: () => {},
        },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response("Unauthorized", { status: 401 });

      const db = getPostgresClient();
      const attachmentId = params.attachmentId;

      const attachments = await db`SELECT conversation_id, mime_type, file_data, status FROM public.attachments WHERE id = ${attachmentId}`;
      if (!attachments.length) return new Response("Not found", { status: 404 });
      const att = attachments[0];

      const members = await db`SELECT true FROM public.conversation_members WHERE conversation_id = ${att.conversation_id} AND user_id = ${user.id}`;
      if (!members.length) return new Response("Forbidden", { status: 403 });
      if (att.status !== "attached") return new Response("Attachment not available", { status: 404 });
      if (!att.file_data) return new Response("Binary data missing", { status: 404 });

      return new Response(att.file_data, {
        headers: {
          "Content-Type": att.mime_type,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (e) {
      console.error("GET attachment error:", e);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  
  PUT: async ({ request, params }) => {
    try {
      const cookies = parseCookies();
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
      const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!supabaseUrl || !supabaseKey) return new Response("Server configuration error", { status: 500 });
      
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
          setAll: () => {},
        },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response("Unauthorized", { status: 401 });

      const db = getPostgresClient();
      const attachmentId = params.attachmentId;

      const attachments = await db`SELECT uploader_id, status FROM public.attachments WHERE id = ${attachmentId}`;
      if (!attachments.length) return new Response("Not found", { status: 404 });
      const att = attachments[0];

      if (att.uploader_id !== user.id) return new Response("Forbidden", { status: 403 });
      if (att.status !== "pending") return new Response("Attachment is not pending", { status: 400 });

      const buffer = await request.arrayBuffer();
      const bytea = Buffer.from(buffer);
      await db`UPDATE public.attachments SET file_data = ${bytea} WHERE id = ${attachmentId}`;
      return new Response(null, { status: 200 });
    } catch (e) {
      console.error("PUT attachment error:", e);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
});
