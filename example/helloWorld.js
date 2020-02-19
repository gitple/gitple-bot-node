/*
 * Copyright 2017 Gitple Inc.
 */

'use strict';

let gitple = require('../');

let botMgrConfig = require('../config.json'); // bot manager config
let botMgr = new gitple.BotManager(botMgrConfig);

botMgr.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig); // start your bot instance

  if (!myBot) { return done(new Error('bot creatation fail')); }

  console.log(`[botMgr] start bot ${myBot.id}. user identifier:`, botConfig && botConfig.user.identifier);

  myBot.sendMessage('Hello World!'); // do your stuff
  myBot.on('message', (message) => {
    myBot.sendMessage('echo message - ' + message);
  });

  return done();
});

botMgr.on('end', (botId, done) => {
  let myBot = botMgr.getBot(botId);

  myBot.finalize(); // finalize your bot instance

  return done();
});

process.on('SIGTERM', () => {
  console.info('SIGTERM');

  try {
    botMgr.finalize(() => {
      process.exit();
    });
  } catch(e) {
    process.exit();
  }
});

process.on('SIGINT', function() {
  console.info('SIGINT');

  try {
    botMgr.finalize(() => {
      process.exit();
    });
  } catch(e) {
    process.exit();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
