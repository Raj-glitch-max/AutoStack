import os

functions_dir = './supabase/functions'

cors_import = "import { corsHeaders } from '../_shared/cors.ts'\n"

cors_logic = """
  // CORS OPTIONS handler (Audit a1)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
"""

for root, dirs, files in os.walk(functions_dir):
    if '_shared' in root:
        continue
    for file in files:
        if file == 'index.ts':
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            
            # Add import if missing
            if 'corsHeaders' not in content:
                # Add import right after the first import or at the top
                if 'import ' in content:
                    parts = content.split('\n', 1)
                    while parts[0].startswith('import ') and len(parts)>1:
                        parts = parts[1].split('\n', 1)
                    
                    # Instead of parsing, just prepend it to the file
                    content = cors_import + content
            
            # Add OPTIONS handler at the start of Deno.serve
            if 'req.method === \'OPTIONS\'' not in content:
                serve_pattern = 'Deno.serve(async (req) => {'
                if serve_pattern in content:
                    content = content.replace(serve_pattern, serve_pattern + cors_logic)
                else:
                    serve_pattern2 = 'Deno.serve(async (req: Request) => {'
                    if serve_pattern2 in content:
                        content = content.replace(serve_pattern2, serve_pattern2 + cors_logic)
            
            with open(filepath, 'w') as f:
                f.write(content)

print('Done fixing CORS.')
