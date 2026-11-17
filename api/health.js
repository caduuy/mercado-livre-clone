const { json } = require('../lib/medusa');

module.exports = function handler(req, res) {
  return json(res, 200, {
    ok: true,
    servico: 'achados-clone',
    medusa: Boolean(process.env.MEDUSA_API_KEY)
  });
};
