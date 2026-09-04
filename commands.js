const ping = require('./cmd-ping');
const vera = require('./cmd-vera');
const platform = require('./cmd-platform');
const identity = require('./cmd-identity');
const label = require('./cmd-label');
const work = require('./cmd-work');
const admin = require('./cmd-admin');
const rp = require('./cmd-rp');
const engage = require('./cmd-engage');
const charts = require('./cmd-charts');
const verified = require('./cmd-verified');
const post = require('./cmd-post');
const promo = require('./cmd-promo');
const cultureline = require('./cmd-cultureline');

module.exports = [ping, vera, platform, identity, label, work, post, promo, engage, cultureline, charts, verified, admin, rp];
