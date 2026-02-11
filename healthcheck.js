const uptime = process.uptime();
const memory = process.memoryUsage();
const status = {
  status: 'ok',
  uptime,
  memory
};
console.log(JSON.stringify(status));
process.exit(0);
