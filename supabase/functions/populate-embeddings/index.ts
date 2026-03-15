import { CORS_HEADERS } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hub-Signature-256, x-client-info, apikey",
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  // CORS OPTIONS handler (Audit a1)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }


  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
    
    // 1. Fetch patterns without embeddings
    const { data: patterns, error: fetchErr } = await supabase
      .from('incident_patterns')
      .select('id, name, description, matching_criteria')
      // .is('embedding', null) // Commented out to force update all 10
    
    if (fetchErr) throw fetchErr

    console.log(`[Populate] Found ${patterns?.length} patterns to embed.`)
    const report: any[] = []
    let updatedCount = 0

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set")

    for (const pattern of patterns || []) {
      const textToEmbed = `${pattern.name} ${pattern.description} ${JSON.stringify(pattern.matching_criteria)}`
      
      try {
          const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              input: textToEmbed,
              model: 'text-embedding-3-small'
            })
          })

          const result = await res.json()
          if (result.error) {
            report.push({ name: pattern.name, error: `OpenAI: ${result.error.message}` })
            continue
          }

          const embedding = result.data[0].embedding
          
          // Use a raw SQL query or ensured format for pgvector if the client helper fails
          // But usually, [0.1, 0.2] works. Let's try explicit array format.
          const { error: updateErr } = await supabase
            .from('incident_patterns')
            .update({ 
               embedding: JSON.stringify(embedding) 
            }) 
            .eq('id', pattern.id)

          if (updateErr) {
            report.push({ name: pattern.name, error: `DB: ${updateErr.message}` })
          } else {
            updatedCount++
            report.push({ name: pattern.name, status: 'success' })
          }
      } catch (e: any) {
          report.push({ name: pattern.name, error: `Catch: ${e.message}` })
      }
    }

    return new Response(JSON.stringify({ success: true, updated: updatedCount, details: report }), {
        headers: { "Content-Type": "application/json" }
    })
  }  catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
