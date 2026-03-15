Deno.serve(async (req) => {
  return new Response(JSON.stringify({ 
    message: "V2 ULTRA MINIMAL SUCCESS",
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  }), { 
    status: 200, 
    headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    } 
  })
})
