/*
 * Copyright 2017 Gitple Inc.
 */

'use strict';
let _ = require('lodash');
let async = require('async');
let gitple = require('../');
let botMgrConfig = require('../config.json');

let botMgr = new gitple.BotManager(botMgrConfig);

function handleBotMessage(inputMessage) {
  /* jshint validthis: true */
  let myBot = this;

  if (_.isNil(inputMessage)) {
    return;
  }

  if (inputMessage === '/quit') {
    myBot.sendCommand('botEnd');          // request to end my bot
  } else if (inputMessage === '/transfer') {
    myBot.sendCommand('transferToAgent'); // request to transfer to agent
  } else {
    // After key-in indication for one second, user get echo back message.
    myBot.sendKeyInEvent();

    let message = [
      {
        t: `echo message - ${inputMessage}`,  // title
        a: [                      // buttons
          { p: 'button', t: 'End talk!', c: '/quit' },
          { p: 'button', t: 'Human please', c: '/transfer' }
        ]
      }
    ];
    setTimeout(() => {
      myBot.sendMessage(message);
    }, 1 * 1000);
  }
}

function saveAllBot(cb) {
  let allBots = botMgr.getAllBots();

  async.eachSeries(allBots, (myBot, done) => {
    myBot.saveState(done);
  },
  (err) => {
    return cb && cb(err);
  });
}

// on bot start
botMgr.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig);

  if (!myBot) { return; }

  console.log(`[botMgr] start bot ${myBot.id}. user identifier:`, botConfig && botConfig.user.identifier);

  myBot.on('message', handleBotMessage);

  // After key-in indication for one second, user get welcom message on a bot startup.
  myBot.sendKeyInEvent();

  setTimeout(() => {
    let message = [
      {
        t: 'Welcome to my bot!',  // title
        a: [                      // buttons
          { p: 'button', t: 'End talk!', c: '/quit' },
          { p: 'button', t: 'Human please', c: '/transfer' }
        ]
      }
    ];
    myBot.sendMessage(message);
  }, 1 * 1000);

  return done && done();
});

// on bot end
botMgr.on('end', (botId, done) => {
  let myBot = botMgr.getBot(botId);

  console.log(`[botMgr] end bot  ${myBot && myBot.id}. user identifier:`, _.get(myBot && myBot.config, 'user.identifier'));

  if (myBot) {
    myBot.finalize();
  }

  // do something
  return done && done();
});

// on bot recovery from stored info
botMgr.on('recovery', (botRecovery) => {
  let botConfig =  botRecovery.config;
  let myBot = new gitple.Bot(botMgr, botConfig, botRecovery.state);

  if (!myBot) { return; }

  console.log(`[botMgr] recovery bot ${myBot.id}. ${botRecovery.savedTime} user identifier:`, _.get(botConfig, 'user.identifier'));

  myBot.on('message', handleBotMessage);

  const BOT_TTL = 5 * 60 * 1000; // 5min
  let savedTime = botRecovery.savedTime;
  if (Date.now() - savedTime > BOT_TTL) { // End bot if it has been more than BOT_TTL
    myBot.sendCommand('botEnd'); // request to end my bot

    _.delay(() => {
      if (botMgr.getBot(myBot.id)) {
        myBot.finalize();
      }
    }, 2000);
  } else {
    // After key-in indication for one second, user get sorry message.
    myBot.sendKeyInEvent();

    setTimeout(() => {
      let message = 'I\'m sorry. Please say that again.';
      myBot.sendMessage(message);
    }, 1 * 1000);
  }
});

botMgr.on('timeout', (botId) => {
  console.info('[botMgr] timeout, finalize it in 2secs', botId);
  let myBot = botMgr.getBot(botId);

  if (myBot) { // send botEnd command and finalize in 2 secs.
    myBot.sendCommand('botEnd');

    _.delay(() => {
      if (botMgr.getBot(botId)) {
        myBot.finalize();
      }
    }, 2000);
  }
});

botMgr.on('ready', () => {
  console.info('[botMgr] ready');
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

process.on('SIGTERM', () => {
  console.info('SIGTERM');

  saveAllBot(() => {
    process.exit();
  });
});
process.on('SIGINT', function() {
  console.info('SIGINT');

  saveAllBot(() => {
    process.exit();
  });
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
