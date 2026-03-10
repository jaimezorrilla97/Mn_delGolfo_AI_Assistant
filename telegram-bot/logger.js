export const logger = {
  info: (component, msg, ...args) => log('info', component, msg, args),
  error: (component, msg, ...args) => log('error', component, msg, args),
  warn: (component, msg, ...args) => log('warn', component, msg, args),
  debug: (component, msg, ...args) => log('debug', component, msg, args),
};

function log(level, component, msg, args) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    msg: typeof msg === 'string' ? msg : JSON.stringify(msg),
    data: args.length > 0 ? args : undefined,
  };
  console[level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'log')](JSON.stringify(entry));
}
