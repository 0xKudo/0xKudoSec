module.exports = {
  apps: [{
    name: 'cybertools-server',
    script: 'index.js',
    env_production: {
      NODE_ENV: 'production',
      PORT: 4000,
    },
  }],
};
