const db = require('../database/db');

async function getAuditLogs(req, res) {
  try {
    const logs = db.all(`
      SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.username, u.role
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.id DESC
      LIMIT 100
    `);

    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getClaimAuditLogs(req, res) {
  try {
    const { id } = req.params;
    const logs = db.all(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.username, u.role
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.entity_type = 'CLAIM' AND a.entity_id = ?
       ORDER BY a.id ASC`,
      id
    );

    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAuditLogs,
  getClaimAuditLogs,
};
