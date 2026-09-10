import fs from "fs";
import postgres from "postgres";

const envText = fs.readFileSync(".env", "utf8");
const dbUrlLine = envText.split("\n").find((l) => l.startsWith("DATABASE_URL="));
const connectionString = dbUrlLine ? dbUrlLine.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "") : "";

if (!connectionString) {
  console.error("Missing DATABASE_URL in .env");
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: "require" });

async function migrate() {
  try {
    console.log("[Migration] Checking public.attachments in Neon...");
    
    await sql`
      CREATE TABLE IF NOT EXISTS public.attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
        uploader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
        message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL UNIQUE,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size BIGINT NOT NULL CHECK (file_size > 0),
        file_data BYTEA,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'attached', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `;

    await sql`ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS file_data BYTEA;`;

    await sql`CREATE INDEX IF NOT EXISTS attachments_conversation_idx ON public.attachments(conversation_id, created_at DESC);`;
    await sql`CREATE INDEX IF NOT EXISTS attachments_message_idx ON public.attachments(message_id) WHERE message_id IS NOT NULL;`;

    await sql`ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_check;`;
    await sql`ALTER TABLE public.messages ADD CONSTRAINT messages_body_check CHECK (char_length(body) <= 4000);`;


    console.log("[Migration] Migration applied successfully!");

    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attachments'
      ORDER BY ordinal_position;
    `;
    console.log("[Verification] Columns in public.attachments:");
    console.table(cols);

  } catch (err) {
    console.error("[Migration] Error applying migration:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
