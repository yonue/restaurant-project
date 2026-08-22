const { startServer } = require('./src/app');

startServer().catch((error) => {
  console.error('Erreur de démarrage:', error.message);
  process.exit(1);
});
