import { createChannel } from './channel.js';
import { log } from './log.js';

const channel = createChannel();
await channel.connect();

log.info('main', 'claude-reminder is running');
