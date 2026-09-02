const ping = require('./cmd-ping');
const vera = require('./cmd-vera');
const platform = require('./cmd-platform');
const identity = require('./cmd-identity');
const label = require('./cmd-label');
const work = require('./cmd-work');
const admin = require('./cmd-admin');
const rp = require('./cmd-rp');

module.exports = [ping, vera, platform, identity, label, work, admin, rp];
