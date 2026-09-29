/**
 * Write a notification on the caller's transaction/connection.
 * Address it to one user (`userId`) or to every user of a role (`roleTarget`).
 */
async function notify(executor, {
  userId = null, roleTarget = null, type = 'system', category = null, title, summary = null, priority = 'normal',
  sender = {}, actionType = null, actionPayload = null,
}) {
  const { rows } = await executor.query(
    `INSERT INTO notifications (user_id, role_target, type, category, title, summary, sender_name, sender_role, sender_avatar,
                                priority, action_type, action_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [userId, userId ? null : roleTarget, type, category, title, summary,
      sender.name ?? 'Hệ thống NEXUS HR', sender.role ?? 'System', sender.avatar ?? null, priority, actionType,
      actionPayload ? JSON.stringify(actionPayload) : null]
  );
  return rows[0];
}

module.exports = { notify };
