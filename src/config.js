const requiredSecrets = ['API_KEY', 'ADMIN_PASSWORD', 'JWT_SECRET'];

function readSecret(name) {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required secret: ${name}`);
  }

  return value;
}

export function getConfig() {
  return {
    apiKey: readSecret('API_KEY'),
    adminPassword: readSecret('ADMIN_PASSWORD'),
    jwtSecret: readSecret('JWT_SECRET')
  };
}

export function validateConfig(env = process.env) {
  return requiredSecrets.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
}
