/*
 * Copyright 2017 Gitple Inc.
 */

'use strict';
let gitple = require('../');
let botMgrConfig = require('../config.json');
let store = require('json-fs-store')();

let botMgr = new gitple.BotManager(botMgrConfig);
let botInstances = {};

function handleBotMessage(inputMessage, option) {
  let myBot = this;
  let resCommand = option && option.c;

  if (resCommand !== undefined && resCommand !== null) {
    inputMessage = resCommand;
  }

  if (inputMessage === undefined || inputMessage === null) {
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

function storeUpdateBot(myBot) {
  let storeObject = {
    id: myBot.id,
    config: myBot.config,
    ctime: Date.now()
  };
  if (myBot.userData) {
    storeObject.userData = myBot.userData;
  }
  store.add(storeObject, () => {});
}

function storeRemoveBot(botId) {
  store.remove(botId, () => {});
}

function storeRecoveryBot() {
  // to restore bot
  store.list(function(err, storedObjects) {
    storedObjects.forEach((storedObject) => {
      if (!botInstances[storedObject.id] && storedObject.config && storedObject.ctime) {
        botMgr.validateBot(storedObject.config, (err, result) => {
          if (err || !result) { return; }

          if (result.valid) {
            let myBot = new gitple.Bot(botMgr, storedObject.config, storedObject.userData);
            botInstances[myBot.id] = myBot;

            if (Date.now() - storedObject.ctime > 1 * 60 * 60 * 1000) { // End bot if it has been more than 1 hour
              myBot.sendCommand('botEnd'); // request to end my bot
            } else {
              console.log(`[botMgr] recovery bot ${myBot.id}. user identifier:`, storedObject.config.user.identifier);

              // After key-in indication for one second, user get sorry message.
              myBot.sendKeyInEvent();

              setTimeout(() => {
                let message = 'I\'m sorry. Please say that again.';
                myBot.sendMessage(message);
              }, 1 * 1000);

              myBot.on('message', handleBotMessage);
            }
          } else {
            storeRemoveBot(storedObject.id);
          }
        });
      }
    });
  });
}

// on bot start
botMgr.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig);
  botInstances[myBot.id] = myBot;

  console.log(`[botMgr] start bot ${myBot.id}. user identifier:`, botConfig && botConfig.user.identifier);

  storeUpdateBot(myBot);

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

  myBot.on('message', handleBotMessage);

  return done && done();
});

// on bot end
botMgr.on('end', (bot, done) => {
  console.log(`[botMgr] end bot  ${bot && bot.id}. user identifier:`, bot && bot.config.user.identifier);

  if (bot && botInstances[bot.id]) {
    bot.finalize();
    storeRemoveBot(bot.id);
    delete botInstances[bot.id];
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
  storeRecoveryBot();
});
