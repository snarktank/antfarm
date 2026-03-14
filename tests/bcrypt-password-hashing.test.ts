import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('jimmy-ai-studio should use bcrypt for password hashing', async () => {
  const serverPath = path.join(process.cwd(), '..', 'jimmy-ai-studio', 'backend', 'server.js');
  
  if (!fs.existsSync(serverPath)) {
    console.log('⚠️  jimmy-ai-studio/backend/server.js not found, skipping test');
    return;
  }
  
  const content = fs.readFileSync(serverPath, 'utf-8');
  
  // 1. bcrypt must be imported
  assert.ok(
    content.includes("require('bcrypt')") || content.includes('require("bcrypt")'),
    'bcrypt package must be imported'
  );
  
  // 2. SHA256 password hashing should not be used directly for auth
  const sha256Match = content.match(/crypto\.createHash\(['"]sha256['"]\)\.update\(password/);
  if (sha256Match) {
    // If SHA256 is present, it must be in migration context only
    const lines = content.split('\n');
    let sha256LineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("crypto.createHash('sha256').update(password")) {
        sha256LineIdx = i;
        break;
      }
    }
    
    if (sha256LineIdx !== -1) {
      // Check surrounding context for migration logic
      const contextStart = Math.max(0, sha256LineIdx - 5);
      const contextEnd = Math.min(lines.length, sha256LineIdx + 5);
      const context = lines.slice(contextStart, contextEnd).join('\n');
      
      assert.ok(
        context.includes('isSHA256') || context.includes('legacy') || context.includes('migrate'),
        'SHA256 usage must be in migration context only'
      );
    }
  }
  
  // 3. bcrypt.compare must be used for password verification
  assert.ok(
    content.includes('bcrypt.compare'),
    'bcrypt.compare() must be used for password verification'
  );
  
  // 4. Login handler must be async (required for bcrypt)
  assert.ok(
    /app\.post\(['"]\/api\/login['"],\s*async/.test(content),
    'Login handler must be async to use bcrypt'
  );
  
  console.log('✅ bcrypt password hashing implemented correctly');
});
