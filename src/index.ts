/*
 * Copyright 2017 Gitple Inc.
 */

'use strict';
let mqtt = require('mqtt');
const jsonrpc = require('jsonrpc-lite');
let uuid = require('uuid');
let _ = require('lodash');
let jsonFsStore = require('json-fs-store')();

const ONE_MIN_IN_MS = 60 * 1000; // 1min
const BOT_TIMEOUT = 10 * 60 * 1000; // 10min

import events = require('events');

export interface Store {
  add(key: string, obj: Object, cb?: (err: Error) => void);
  remove(key: string, cb?: (err: Error) => void);
  list(cb: (err: Error, storedList: string[]) => void);
}

export class JsonFsStore implements Store {
  add(key: string, obj: any, cb?: (err: Error) => void) {
    if (!cb) { cb = _.noop; }
    obj.id = key;
    jsonFsStore.add(obj, cb);
  }
  remove(key: string, cb?: (err: Error) => void) {
    if (!cb) { cb = _.noop; }

    jsonFsStore.load(key, (err: Error, obj: any) => {
      if (obj) {
        jsonFsStore.remove(key, cb);
      } else {
        return cb && cb(null);
      }
    });
  }
  list(cb: (err: Error, storedList: string[]) => void) {
    if (!cb) { cb = _.noop; }
    jsonFsStore.list(cb);
  }
}

export interface BotManagerConfig {
  SP_ID: number|string;
  APP_ID: number|string;
  BOT_ID: number|string;
  BOT_GATEWAY_USER: string;
  BOT_GATEWAY_SECRET: string;
  BOT_GATEWAY_HOST?: string;
  BOT_GATEWAY_PORT?: number;
  APP_CODE?: string;
}

export interface BotConfig {
  id: string;
  context: {
    room: string;
    session: string;
    bot: string;
  };
  topic: {
    msgSub: string;
    msgPub: string;
    cmdPub: string;
    cmdResPub: string;
  };
  user: any;
}

export class BotManager extends events.EventEmitter {
  config: BotManagerConfig;
  client: any;
  store: Store;
  botInstances: { [key: string]: Bot; } = {}; // bot instances which keeps context and etc

  constructor(config: BotManagerConfig, store?: Store) {
    super();

    const self = this;
    const username = config.BOT_GATEWAY_USER ? `${config.BOT_GATEWAY_USER}` : `${config.BOT_ID}`;

    const botSecret = config.BOT_GATEWAY_SECRET;
    const segments = botSecret && botSecret.split('.');
    const payload = segments && segments[1] && new Buffer(segments[1], 'base64').toString();
    const payloadInfo = payload && payload.split(':');
    const SP_ID = config.SP_ID || (payloadInfo && payloadInfo[2]);
    const APP_ID = config.APP_ID || (payloadInfo && payloadInfo[3]);

    this.config = config;
    this.store = store ? store : new JsonFsStore();

    // connect mqtt
    this.client = mqtt.connect({
      protocol: 'wss', // over websocket
      hostname: config.BOT_GATEWAY_HOST || 'mqtt.gitple.io',
      port: config.BOT_GATEWAY_PORT || 443,
      path: '/mogi',
      clean: true,
      clientId: `chatbot:${username}-${uuid()}`, //unique id accross chatbot instances
      username: `${username}`, // any string
      password: config.BOT_GATEWAY_SECRET,
      connectTimeout: 60 * 1000, // 60 seconds
      keepalive: 30 // 30 seconds
    });
    this.client.once('connect', function (/*options*/) {
      self.emit('ready');
      self.recoverBots();
    });
    this.client.on('connect', function (/*options*/) {
      // console.log('[MQTT CLIENT] connect');
      self.emit('connect');
    });
    this.client.on('reconnect', function () {
      // console.log('[MQTT CLIENT] reconnect');
      self.emit('reconnect');
    });
    this.client.on('close', function () {
      // console.log('[MQTT CLIENT] close');
      self.emit('disconnect');
    });
    // this.client.on('offline', function () {
    //   // console.log('[MQTT CLIENT] offline');
    //   // self.emit('offline');
    // });
    this.client.on('error', function (err: Error) {
      // console.log('[MQTT CLIENT] error', err && err.toString());
      self.emit('error', err && err.toString());
    });

    // subscribe topics
    this.client.subscribe([
      `s/${SP_ID}/a/${APP_ID}/t/${config.BOT_ID}/req/t/${config.BOT_ID}/#`, // bot mgr request
      `s/${SP_ID}/a/${APP_ID}/u/+/r/+/res/t/${config.BOT_ID}/#`, // bot command response
    ]);

    // receive mqtt messages
    this.client.on('message', function (topic: string, payload: any) {
      payload = payload.toString(); // from buffer to string

      let splitedTopic = topic.split('/');
      let parsedObj;
      let message;

      if (topic.indexOf(`s/${SP_ID}/a/${APP_ID}/`) !== 0) {
        console.error(`'[SKIP], invalid topic: ${topic}`, payload);
        return;
      }

      // chatbot manager: process request such as start and end
      // BOT_MANAGER_REQ_TOPIC = `s/${SP_ID}/a/${APP_ID}/t/+/req/t/${config.BOT_ID}/#`
      if (splitedTopic.length >= 7 &&
          splitedTopic[4] === 't' && splitedTopic[6] === 'req') {
        try {
          parsedObj = jsonrpc.parse(payload);
          if (parsedObj.type !== 'request') {
            console.error('Invalid payload: not a req', topic, payload);
            return;
          }
          message = parsedObj.payload;
        } catch (e) {
          console.error('Invalid payload', topic, payload);
          return;
        }

        //  let spId = splitedTopic[1];
        //  let appId = splitedTopic[3];
        //  let botId = splitedTopic[5];
        let context = message.params._context;
        let roomId = context.room; // room id in the context
        let sessionId = context.session;
        let msgSubTopic = message.params.msgSub;
        let msgPubTopic = message.params.msgPub;
        let cmdPubTopic = message.params.cmdPub;
        let cmdResPubTopic = message.params.cmdResPub;
        let resPubTopic = message.params.resPub;
        let instanceId = `bot:${roomId}:${sessionId}`; // new chatbot instance per room id
        let bot = self.botInstances[instanceId];

        // console.log(`[JSONRPC REQUEST] gitple --> chatbot : ${topic}`);
        switch (message.method) {
          case 'start':
            if (Number(message.params._context.bot) !== config.BOT_ID) {
              return;
            }

            // console.log('Start new chatbot instance', topic, message.params, bot);
            if (!bot) {
              let botConfig: BotConfig = {
                id: instanceId,
                context: message.params._context, //context, saved at the start command, included for every message
                topic: {
                  msgSub: msgSubTopic, //a topic where message to receive
                  msgPub: msgPubTopic, //a topic where message to send
                  cmdPub: cmdPubTopic, //a topic where command to send
                  cmdResPub: cmdResPubTopic, //a topic where command to send
                },
                user: message.params.user
              };

              self.emit('start', botConfig, (err?: Error|string) => {
                if (resPubTopic) {
                  if (err) {
                    self.client.publish(resPubTopic, jsonrpc.error(message.id, new jsonrpc.JsonRpcError(err.toString())).toString());
                  } else {
                    self.client.publish(resPubTopic, jsonrpc.success(message.id, 'OK').toString());
                  }
                }
              });
            }
            return;

          case 'end':
            if (Number(message.params._context.bot) !== config.BOT_ID) {
              return;
            }

            // console.log('End a chatbot instance', topic, message.params);
            if (bot) {
              self.emit('end', bot.id, (err?: Error|string) => {
                if (resPubTopic) {
                  if (err) {
                    self.client.publish(resPubTopic, jsonrpc.error(message.id, new jsonrpc.JsonRpcError(err.toString())).toString());
                  } else {
                    self.client.publish(resPubTopic, jsonrpc.success(message.id, 'OK').toString());
                  }
                }
              });
            }
            return;

          default:
            console.error('Unknown command', message.method);
            self.emit('error', 'unknown command', message.method);
            if (resPubTopic) {
              self.client.publish(resPubTopic, jsonrpc.error(message.id, jsonrpc.JsonRpcError.methodNotFound()).toString());
            }
            return;
        }

      // chatbot instance: process response
      // BOT_INSTANCE_RES_TOPIC = `s/${SP_ID}/a/${APP_ID}/u/+/r/+/res/t/${config.BOT_ID}/#`
      } else if (splitedTopic.length >= 11 &&
        splitedTopic[4] === 'u' && splitedTopic[6] === 'r' && splitedTopic[8] === 'res') {

        try {
          parsedObj = jsonrpc.parse(payload);
          message = parsedObj.payload;
        } catch (e) {
          console.error('Invalid payload', topic, payload);
          return;
        }

        //console.log(`[JSONRPC RESPONSE] gitple --> chatbot : ${topic}`);
        if (parsedObj.type === 'success') {
          // console.log('Sucess response', message);
        } else { // 'error'
          console.error('Error response', message);
        }
        return;

      // chatbot instance: messages from user
      // BOT_INSTANCE_MSG_TOPIC = `s/${SP_ID}/a/${APP_ID}/u/+/r/+/u/+`
      } else if (splitedTopic.length >= 9 &&
        splitedTopic[4] === 'u' && splitedTopic[6] === 'r' &&  splitedTopic[8] === 'u') {
        //console.log(`[MESSAGE] gitple --> chatbot : ${topic}`);
        try {
          parsedObj = JSON.parse(payload);
        } catch (e) { /* do nothing */ }

        if (parsedObj) {
          let roomId = splitedTopic[7]; // room id in the topic
          let sessionId = parsedObj._sid;

          let instanceId = `bot:${roomId}:${sessionId}`;
          let bot = self.botInstances[instanceId];

          if (bot) {
            let event = parsedObj.e;

            if (event) {
              bot.emit('event', event);
            } else {
              let message = parsedObj.m;
              let resCommand = parsedObj.c;
              let isCommand = false;

              if (!_.isUndefined(resCommand) && !_.isNull(resCommand)) {
                isCommand = true;
                message = resCommand;
              }

              //console.log('<Message text, html or component>', parsedObj.m);
              bot.emit('message', message, { isUserInput: !isCommand });
            }

          } else {
            //TODO: start new bot instance
          }
        }
      }
    });

    // timeout event for older than 10 min bot
    setInterval(() => {
      let now = _.now();
      _.each(self.botInstances, (bot: Bot) => {
        if (now - bot.mtime > BOT_TIMEOUT) {
          // console.log(`quit Bot (>10min older) bot:${bot.id}`);
          self.emit('timeout', bot.id);
        }
      });
    }, ONE_MIN_IN_MS);
  }

  private removeBotState(id: string) {
    let self = this;
    if (!self.store) {
      return;
    }

    self.store.remove(id, (err: Error) => {
      if (err) { console.error('[BotManager.removeStore] remove error', err); }
    });
  }

  private recoverBots(cb?: (err?: Error) => void) {
    let self = this;
    if (!self.store) {
      return cb && cb();
    }

    self.store.list((err: Error, storedList: string[]) => {
      _.each(storedList, (storedObj: any) => {
        let id: string = storedObj.id;

        if (!self.getBot(id)) {
          self.validateBot(storedObj.config, (err, result) => {
            if (err) { return; }

            if (result && result.valid) {
              let recoveryObject = {
                config: storedObj.config,
                state: storedObj.state,
                savedTime: storedObj.stime
              };

              self.emit('recovery', recoveryObject);
            } else {
              self.removeBotState(id);
            }
          });
        }
        // console.log('[recoverBots]', id);
        return cb && cb();
      });
    });
  }

  addBot(bot: Bot) {
    if (this.botInstances[bot.id]) {
      console.error('already added', bot.id);
      return;
    }
    this.botInstances[bot.id] = bot;
  }
  removeBot(bot: Bot) {
    if (this.botInstances[bot.id]) {
      delete this.botInstances[bot.id];
    }
  }

  validateBot(botConfig: BotConfig, cb: (err: Error, result: { valid: boolean }) => void) {
    return cb && cb(null, { valid: true });
  }

  getBot(bot: string|Bot) {
    let botId: string;
    if (_.isString(bot)) {
      botId = bot as string;
    } else if (bot) {
      botId = _.get(bot, 'id');
    }
    if (this.botInstances[botId]) {
      return this.botInstances[botId];
    } else {
      return null;
    }
  }

  getAllBots() {
    return _.toArray(this.botInstances);
  }
}

export class Bot extends events.EventEmitter {
  config: BotConfig;
  client: any;
  botManager: BotManager;
  id: string;
  state: any;
  mtime: number;
  ctime: number;

  constructor(botManager: BotManager, botConfig: BotConfig, state?: any) {
    super();
    this.id = botConfig.id;
    this.config = botConfig;
    this.client = botManager.client;
    this.botManager = botManager;
    this.state = state;

    this.client.subscribe(this.config.topic.msgSub); //suscribe to message topic
    this.botManager.addBot(this);
    this.ctime = this.mtime = _.now();
  }

  finalize() {
    this.deleteState();
    this.botManager.removeBot(this);
    this.client.unsubscribe(this.config.topic.msgSub); // unsubscribe message
    this.removeAllListeners();
  }

  sendMessage(mqttMessage: any, option?: any, cb?: (err: Error) => void) {
    this.mtime = _.now();

    if (_.isFunction(option)) {
      cb = option;
      option = null;
    }

    let topic = this.config.topic.msgPub;
    let message: any = { t: Date.now(), m: mqttMessage, _sid: this.config.context.session };

    if (option) {
      message.o = option;
    }

    if (topic && message) {
      //console.log('gitpleBotSendMessage() message:', topic, message);
      this.client.publish(topic, JSON.stringify(message), function(err?: Error) {
        return cb && cb(err);
      });
    } else {
      return cb && cb(new Error('no message to send'));
    }
  }

  sendKeyInEvent(cb?: (err?: Error) => void) {
    this.mtime = _.now();

    let topic = this.config.topic.msgPub;
    let message = { t: Date.now(), e: { keyIn: 's'}, _sid: this.config.context.session };

    if (topic && message) {
      this.client.publish(topic, JSON.stringify(message), function(err?: Error) {
        return cb && cb(err);
      });
    } else {
      return cb && cb(Error('no message to send'));
    }
  }

  sendCommand(command: 'botEnd'|'transferToAgent', cb?: (err?: Error) => void) {
    this.mtime = _.now();

    let rpcData;
    let context = this.config.context;
    let cmdPubTopic = this.config.topic.cmdPub;
    let cmdResPubTopic = this.config.topic.cmdResPub;

    if (command === 'botEnd') {
      rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'end', {
        _context: context, // every message should include the saved context
        resPub: cmdResPubTopic, // resonse topic for cmdPubTopic
      }).toString();
    } else if (command === 'transferToAgent') {
      rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'transfer', {
        type: 'agent', // transfer to target
        _context: context, // every message should include the saved context
        resPub: cmdResPubTopic, // resonse topic for cmdPubTopic
      }).toString();
    }

    if (rpcData) {
      // console.log(`[JSONRPC REQUEST] chatbot --> gitple : ${cmdPubTopic}`);
      //console.log(rpcData);
      this.client.publish(cmdPubTopic, rpcData, function(err?: Error) {
        return cb && cb(err);
      });
    }
  }

  saveState(cb?: any) {
    let self = this;
    let store = self.botManager.store;

    if (!store) { return; }

    store.add(self.id, {
      config: self.config,
      stime: _.now(),
      state: self.state,
    }, (err: Error) => {
      if (err) {
        console.error('[Bot.saveStore] add error', err);
      } else {
        // console.log('[Bot.saveStore] add', self.id);
      }
      return cb && cb(err);
    });
  }

  deleteState() {
    let self = this;
    let store = self.botManager.store;

    if (!store) { return; }

    store.remove(self.id, (err: Error) => {
      if (err) { console.error('[Bot.deleteState] remove error', err); }
    });
  }
}
