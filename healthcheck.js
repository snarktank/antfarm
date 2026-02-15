console.log(JSON.stringify({
  status: 'ok',
  uptime: process.uptime(),
  memory: process.memoryUsage()
}, null, 2));
