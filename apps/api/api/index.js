// Función serverless de Vercel (BL-018): puente JS plano hacia el Nest compilado en dist/.
// vercel.json reescribe todas las rutas a esta función; el bootstrap se cachea entre invocaciones.
const { getServer } = require('../dist/serverless.js');

module.exports = async (req, res) => {
  const app = await getServer();
  app(req, res);
};
