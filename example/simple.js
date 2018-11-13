/*
 * Copyright 2017 Gitple Inc.
 */

'use strict';
let _ = require('lodash');
let gitple = require('../');
let botMgrConfig = require('../config.json');

let botMgr = new gitple.BotManager(botMgrConfig);

function handleBotMessage(inputMessage) {
  /* jshint validthis: true */
  let myBot = this;

  if (_.isNil(inputMessage)) {
    return;
  }

  if (inputMessage === 'END BOT') {
    myBot.sendCommand('botEnd');          // request to end my bot
  } else if (inputMessage === 'TRANSFER BOT') {
    myBot.sendCommand('transferToAgent'); // request to transfer to agent
  } else {
    // After key-in indication for one second, user get echo back message.
    myBot.sendKeyInEvent();

    let messageObject = [
      {
        t: 'echo message - ' + inputMessage,  // title
        a: [                      // buttons
          { p: 'button', t: 'End talk!', c: 'END BOT' },
          { p: 'button', t: 'Human please', c: 'TRANSFER BOT' }
        ]
      }
    ];
    setTimeout(() => { myBot.sendMessage(messageObject); }, 1 * 1000);
  }
}

// on bot start
botMgr.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig);

  console.log(`[botMgr] start bot ${myBot.id}. user identifier:`, botConfig && botConfig.user.identifier);

  myBot.saveState();

  myBot.on('message', handleBotMessage);

  // After key-in indication for one second, user get welcom message on a bot startup.
  myBot.sendKeyInEvent();

  setTimeout(() => {
    let messageObject = [
      {
        t: 'Welcome to my bot!',  // title
        a: [                      // buttons
          { p: 'button', t: 'End talk!', c: 'END BOT' },
          { p: 'button', t: 'Human please', c: 'TRANSFER BOT' }
        ]
      }
    ];
    myBot.sendMessage(messageObject);
  }, 1 * 1000);

  return done && done();
});

// on bot end
botMgr.on('end', (bot, done) => {
  console.log(`[botMgr] end bot  ${bot && bot.id}. user identifier:`, bot && bot.config.user.identifier);

  if (bot && botMgr.getBot(bot)) {
    bot.finalize();
  }

  // do something
  return done && done();
});

botMgr.on('error', (err) => {
  console.error('[botMgr] error', err);
});

botMgr.on('connect', () => {
  console.info('[botMgr] connect');
});

botMgr.on('reconnect', () => {
  console.info('[botMgr] reconnect');
});

botMgr.on('disconnect', () => {
  console.info('[botMgr] disconnect');
});

botMgr.on('ready', () => {
  console.info('[botMgr] ready');
  botMgr.recoverBots();
});

botMgr.on('botTimeout', (botId) => {
  console.info('[botMgr] botTimeout, finalize it in 2secs', botId);
  let bot = botMgr.getBot(botId);

  if (bot) { // send botEnd command and finalize in 2 secs.
    bot.sendCommand('botEnd');
    _.delay(() => { bot.finalize(); }, 2000);
  }
});
