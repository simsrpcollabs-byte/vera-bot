const db = require('./database');
const { applyPromotionBoost } = require('./metrics');
const { buildSocialPostEmbed } = require('./socialPosts');

async function completePromotion(client, promotion) {
  const post = db.prepare(`
    SELECT sp.*, i.civilian_name, i.verified FROM social_posts sp
    JOIN identities i ON i.id = sp.identity_id WHERE sp.id = ?
  `).get(promotion.social_post_id);
  if (!post) {
    db.prepare(`UPDATE promotions SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(promotion.id);
    return;
  }
  const currentMetrics = JSON.parse(post.metrics_json);
  const { metrics, watcherDelta } = applyPromotionBoost(currentMetrics, promotion.promo_level, promotion.duration_minutes);
  const finish = db.transaction(() => {
    db.prepare(`UPDATE social_posts SET metrics_json = ? WHERE id = ?`).run(JSON.stringify(metrics), post.id);
    db.prepare(`UPDATE work_metrics SET metrics_json = ? WHERE work_id = ?`).run(JSON.stringify(metrics), post.work_id);
    if (watcherDelta) {
      db.prepare(`
        UPDATE social_profiles SET followers = followers + ?, activity_score = activity_score + ?, updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ? AND identity_id = ? AND platform_code = ?
      `).run(watcherDelta, metrics.chart?.score || 0, post.guild_id, post.identity_id, post.platform_code);
    }
    db.prepare(`
      UPDATE promotions SET status = 'completed', final_metrics_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(JSON.stringify(metrics), promotion.id);
  });
  finish();

  if (promotion.channel_id && promotion.message_id) {
    const promoChannel = await client.channels.fetch(promotion.channel_id).catch(() => null);
    const promoMessage = promoChannel?.isTextBased()
      ? await promoChannel.messages.fetch(promotion.message_id).catch(() => null) : null;
    if (promoMessage) await promoMessage.delete().catch(() => {});
  }
  if (post.channel_id && post.message_id) {
    const originalChannel = await client.channels.fetch(post.channel_id).catch(() => null);
    const originalMessage = originalChannel?.isTextBased()
      ? await originalChannel.messages.fetch(post.message_id).catch(() => null) : null;
    if (originalMessage) await originalMessage.edit({ embeds: [buildSocialPostEmbed(post, post, metrics)] }).catch(() => {});
  }
  console.log(`Completed promotion ${promotion.id} for social post ${post.id}.`);
}

async function completeExpiredPromotions(client) {
  const expired = db.prepare(`
    SELECT * FROM promotions WHERE status = 'active' AND expires_at_ms <= ? ORDER BY expires_at_ms LIMIT 25
  `).all(Date.now());
  for (const promotion of expired) {
    try { await completePromotion(client, promotion); }
    catch (error) { console.error(`Could not complete promotion ${promotion.id}:`, error); }
  }
}

function startPromotionScheduler(client) {
  completeExpiredPromotions(client).catch((error) => console.error('Promotion check failed:', error));
  const timer = setInterval(() => {
    completeExpiredPromotions(client).catch((error) => console.error('Promotion check failed:', error));
  }, 60_000);
  timer.unref();
}

module.exports = { completeExpiredPromotions, startPromotionScheduler };
