const fs = require('fs');
let content = fs.readFileSync('supabase/functions/messenger-webhook/index.ts', 'utf8');

// 1. Add let parsedBody: any = null;
content = content.replace('let recipientId, message, messagingType, tag;', 'let recipientId, message, messagingType, tag;\n    let parsedBody: any = null;');

// 2. Remove lines 91 to 124
content = content.replace(/\/\/ Check if it's a Supabase Database Webhook trigger[\s\S]*?return new Response\(JSON\.stringify\(\{ success: true, results \}\), \{\n            headers: \{ "Content-Type": "application\/json", 'Access-Control-Allow-Origin': '\*' \},\n            status: 200,\n          \}\);\n        \}/, '');

// 3. Set parsedBody = body
content = content.replace('const body = fbBody;', 'const body = fbBody;\n        parsedBody = fbBody;');

// 4. Update the bottom block to use parsedBody
content = content.replace('const body = await req.json().catch(() => ({}));', 'const body = parsedBody || await req.json().catch(() => ({}));');

fs.writeFileSync('supabase/functions/messenger-webhook/index.ts', content);
