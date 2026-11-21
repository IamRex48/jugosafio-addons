// One shared implementation; platform transports are injected by their native adapters.
module.exports={
 ...require('../../packages/core'),
 ...require('../../packages/core/content'),
 ...require('../../packages/core/identity'),
 ...require('../../packages/core/bank'),
 ...require('../../packages/core/addon-bridge'),
 ...require('../../packages/core/relay-session'),
 wire:require('../../packages/core/relay-protocol'),
};
