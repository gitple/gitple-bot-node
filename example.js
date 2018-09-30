'use strict';
let gitple = require('./');

let botMgrConfig = require('./config.json');
let botMgr = new gitple.BotManager(botMgrConfig);

// on bot start
botMgr.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig);
  let myMessage = {
    t: 'Welcome to my bot!',  // title
    a: [                      // buttons
      { p: 'button', t: 'End talk!', c: { e: 'END BOT' } },
      { p: 'button', t: 'Human please', c: { e: 'TRANSFER BOT' } }
    ]
  };

  // After key-in indication for one second, user get welcom message on a bot startup.
  myBot.sendKeyInEvent();
  setTimeout(() => { myBot.sendMessage(myMessage); }, 1 * 1000);

  myBot.on('message', (message) => {
    if (message === 'END BOT') {
      myBot.sendCommand('botEnd');          // request to end my bot
    } else if (message === 'TRANSFER BOT') {
      myBot.sendCommand('transferToAgent'); // request to transfer to agent
    } else {                              
      // After key-in indication for one second, user get echo back message.
      myMessage.t = 'echo message - ' + message; 
      myBot.sendKeyInEvent();
      setTimeout(() => { myBot.sendMessage(myMessage);  }, 1 * 1000);
    }
  });
  return done && done();
});

// on bot end
botMgr.on('end', (bot, done) => {
  bot.finalize();
  // do something
  return done && done();
});

botMgr.on('error', (err) => {
  console.error('[botMgr] error', err);
});
