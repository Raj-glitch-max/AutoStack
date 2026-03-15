export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Hub-Signature-256, X-GitHub-Event',
}

export function corsResponse(): Response {
  return new Response(null, { status: 200, headers: CORS_HEADERS })
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })
}

export function errorResponse(status: number, message: string, code?: string): Response {
  return new Response(JSON.stringify({
    error: message,
    code: code || 'ERROR',
    status
  }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  })
}
