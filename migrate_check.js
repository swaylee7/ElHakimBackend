const { createClient } = require("@supabase/supabase-js");
const URL = "https://hvcqchhbyrlimlxmjgqf.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2Y3FjaGhieXJsaW1seG1qZ3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU1MTM4MiwiZXhwIjoyMDk3MTI3MzgyfQ.ihPxvADezchHxxH2wqZwIFD-zidw8jeNfKc_tC5tbsg";
const db = createClient(URL, KEY, { auth: { persistSession: false } });

async function run() {
  // Get bibliotheque columns via information_schema
  const { data, error } = await db
    .from("information_schema.columns")
    .select("column_name,data_type")
    .eq("table_name", "bibliotheque")
    .eq("table_schema", "public");
  if (error) console.log("Error:", error.message);
  else console.log("bibliotheque columns:", JSON.stringify(data?.map(c=>c.column_name)));

  const { data: d2 } = await db
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_name", "medecins")
    .eq("table_schema", "public");
  console.log("medecins columns:", JSON.stringify(d2?.map(c=>c.column_name)));
}
run().catch(console.error);
