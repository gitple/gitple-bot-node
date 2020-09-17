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

import { Cluster, ClusterMessageType, ClusterSyncNode, ClusterSendSync, ClusterElection } from './cluster';
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
  APP_CODE: string;
  BOT_GATEWAY_SECRET: string;
  BOT_GATEWAY_HOST?: string;
  BOT_GATEWAY_PORT?: number;
  BOT_CLUSTER_NODE_ID?: number;
}

export interface BotConfig {
  id: string;
  context: {
    room: number;
    session: number;
    bot: number|string;
  };
  topic: {
    msgSub: string;
    msgPub: string;
    cmdPub: string;
    cmdResPub: string;
  };
  user: any;
}

export interface BotCommandTransferToBotParams {
  id: number|string; // botId
}

interface BotClusterForwardCommand {
  nodeId: string; // nodeId of sender
  targetNodeId: string; // nodeId to be assigned bot
  instanceId: string;
  command: any;
}

export class BotManager extends events.EventEmitter {
  client: any;
  store: Store;

  private config: BotManagerConfig;
  private mqttState: 'none'|'connecting'|'connected' = 'none';
  private botInstances: { [key: string]: Bot; } = {}; // bot instances which keeps context and etc

  private cluster: Cluster;
  private clusterSyncPubTopic: string;
  private clusterSyncReqPubTopic: string;
  private clusterElectionPubTopic: string;
  private clusterForwardCommandPubTopic: string;

  private intervalBotHealthCheckTimer;

  constructor(config: BotManagerConfig, store?: Store) {
    super();

    this.config = config;
    this.store = store ? store : new JsonFsStore();

    this.start();
  }

  private handleBotCommand(botId: string, instanceId: string, message: any) {
    let msgSubTopic = message.params.msgSub;
    let msgPubTopic = message.params.msgPub;
    let cmdPubTopic = message.params.cmdPub;
    let cmdResPubTopic = message.params.cmdResPub;
    let resPubTopic = message.params.resPub;
    let bot = this.botInstances[instanceId];

    // console.log(`[JSONRPC REQUEST] gitple --> chatbot : ${topic}`);
    switch (message.method) {
      case 'start':
        if (String(message.params._context.bot) !== String(botId)) {
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

          this.emit('start', botConfig, (err?: Error|string) => {
            if (resPubTopic) {
              if (err) {
                this.mqttPublish(resPubTopic, jsonrpc.error(message.id, new jsonrpc.JsonRpcError(err.toString())));
              } else {
                this.mqttPublish(resPubTopic, jsonrpc.success(message.id, 'OK'));
              }
            }
          });
        }
        return;

      case 'end':
        if (String(message.params._context.bot) !== String(botId)) {
          return;
        }

        // console.log('End a chatbot instance', topic, message.params);
        if (bot) {
          this.emit('end', bot.id, (err?: Error|string) => {
            if (resPubTopic) {
              if (err) {
                this.mqttPublish(resPubTopic, jsonrpc.error(message.id, new jsonrpc.JsonRpcError(err.toString())));
              } else {
                this.mqttPublish(resPubTopic, jsonrpc.success(message.id, 'OK'));
              }
            }
          });
        }
        return;

      default:
        console.error('Unknown command', message.method);
        this.emit('error', 'unknown command', message.method);
        if (resPubTopic) {
          this.mqttPublish(resPubTopic, jsonrpc.error(message.id, jsonrpc.JsonRpcError.methodNotFound()));
        }
        return;
    }
  }

  private mqttPublish(topic: string, message: any, cb?: (err?: Error) => void) {
    let payload: string;

    if (!_.isNil(message) && _.isObject(message)) {
      payload = JSON.stringify(message);
    } else {
      payload = message;
    }

    this.client.publish(topic, payload, cb);
  }

  private clusterGetBotCount(): number {
    return _.size(this.botInstances);
  }

  private clusterSendData(type: ClusterMessageType, data: any, cb?: (err?: Error) => void) {
    let topic: string;

    if (type === 'sync') {
      topic = this.clusterSyncPubTopic;
    } else if (type === 'syncReq') {
      topic = this.clusterSyncReqPubTopic;
    } else if (type === 'election') {
      topic = this.clusterElectionPubTopic;
    } else {
      return cb && cb(new Error('not implemented'));
    }

    this.mqttPublish(topic, data, cb);
  }

  clusterSendForwardCommand(targetNodeId: string, instanceId: string, command: any) {
    const botAssignReq: BotClusterForwardCommand = {
      nodeId: this.cluster.getNodeId(),
      targetNodeId: targetNodeId,
      instanceId: instanceId,
      command: command
    };

    this.mqttPublish(this.clusterForwardCommandPubTopic, botAssignReq, (err?: Error) => {
      return;
    });
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

  start() {
    const self = this;

    if (this.mqttState !== 'none') {
      console.log('[BotManager] ignore start()', this.mqttState);
      return;
    }

    this.mqttState = 'connecting';

    if (this.client) {
      this.client.reconnect();
    } else {
      const config = this.config;
      const botSecret = config.BOT_GATEWAY_SECRET;
      const segments = botSecret && botSecret.split('.');
      const payload = segments && segments[1] && Buffer.from(segments[1], 'base64').toString();
      const payloadInfo = payload && payload.split(':');
      const SP_ID = payloadInfo && payloadInfo[2];
      const APP_ID = payloadInfo && payloadInfo[3];
      const BOT_ID = payloadInfo && payloadInfo[5];

      const username = BOT_ID;
      const bootTime: number = Date.now();
      const bootTimeId: string = (bootTime - 1577836800000).toString(16).split('').reverse().join('');
      const clusterNodeId: string = (_.isNil(config.BOT_CLUSTER_NODE_ID) ? 'node' : String(config.BOT_CLUSTER_NODE_ID)) + '-' + bootTimeId;

      this.clusterSyncPubTopic = `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync`;
      this.clusterSyncReqPubTopic = `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync/req`;
      this.clusterElectionPubTopic = `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/election`;
      this.clusterForwardCommandPubTopic = `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/command`;
      this.cluster = new Cluster(clusterNodeId, bootTime, this.clusterGetBotCount.bind(this), this.clusterSendData.bind(this));

      // connect mqtt
      this.client = mqtt.connect({
        protocol: 'wss', // over websocket
        hostname: config.BOT_GATEWAY_HOST || 'mqtt.gitple.io',
        port: config.BOT_GATEWAY_PORT || 443,
        path: '/mogi',
        clean: true,
        clientId: `chatbot:${username}-${uuid()}`, //unique id accross chatbot instances
        username: `${username}`, // any string
        password: botSecret,
        connectTimeout: 60 * 1000, // 60 seconds
        reconnectPeriod: 10 * 1000, // 10 secodes
        keepalive: 30 // 30 seconds
      });

      this.client.on('connect', function (/*options*/) {
        console.log('[MQTT CLIENT] connect');
        self.mqttState = 'connected';
        self.emit('connect');
        self.cluster.connect();
      });
      this.client.on('reconnect', function () {
        console.log('[MQTT CLIENT] reconnect');
        self.emit('reconnect');
      });
      this.client.on('close', function () {
        console.log('[MQTT CLIENT] close');
        self.emit('disconnect');
        self.cluster.disconnect();
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
        `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/req/t/${BOT_ID}/#`, // bot mgr request
        `s/${SP_ID}/a/${APP_ID}/u/+/r/+/res/t/${BOT_ID}/#`, // bot command response

        `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/#`, // 'bot cluster info'
          // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync`, // 'bot cluster sync info'
          // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync/req`, // 'bot cluster sync info' request
          // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/election`, // bot cluster election
          // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/command`, // bot cluster assign
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

        // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync`
        // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync/req`
        // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/election`
        // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/command`
        if (splitedTopic.length >= 8 && splitedTopic[4] === 't' && splitedTopic[6] === 'cluster') {
          try {
            parsedObj = JSON.parse(payload);
          } catch (e) { /* do nothing */ }

          if (splitedTopic[7] === 'command') {
            if (splitedTopic.length === 8) {
              const forwardCommandInfo: BotClusterForwardCommand = <BotClusterForwardCommand>parsedObj;
              if (self.cluster.getNodeId() === forwardCommandInfo.targetNodeId) {
                self.handleBotCommand(BOT_ID, forwardCommandInfo.instanceId, forwardCommandInfo.command);
              }
            }
          } else if (splitedTopic[7] === 'election') {
            if (splitedTopic.length === 8) {
              self.cluster.handleMessage('election', <ClusterElection>parsedObj);
            }
          } else if (splitedTopic[7] === 'sync') {
            if (splitedTopic.length === 8) {
              // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync`

              const newSyncInfo: ClusterSendSync = <ClusterSendSync>parsedObj;
              if (newSyncInfo) {
                if (newSyncInfo.meta && !_.isNil(newSyncInfo.meta.lastBotInstanceId) && self.cluster.getNodeId() !== newSyncInfo.id) {
                  // Check duplicatedBot
                  const duplicatedBot = self.botInstances[newSyncInfo.meta.lastBotInstanceId];

                  if (duplicatedBot) {
                    if (self.cluster.getNodeBootTime() < newSyncInfo.bootTime) {
                      self.cluster.sendSyncMeta({ lastBotInstanceId: newSyncInfo.meta.lastBotInstanceId });
                    } else if (self.cluster.getNodeBootTime() > newSyncInfo.bootTime) {
                      // remove bot if exists duplicated bot
                      console.warn('Remove duplicatedBot', newSyncInfo.meta.lastBotInstanceId, self.cluster.getNodeId(), newSyncInfo.id);
                      duplicatedBot.finalize();
                    }
                  }
                }

                self.cluster.handleMessage('sync', newSyncInfo);
              }
            } else if (splitedTopic[8] === 'req') {
              if (splitedTopic.length === 9) {
                // `s/${SP_ID}/a/${APP_ID}/t/${BOT_ID}/cluster/sync/req`
                self.cluster.handleMessage('syncReq', null);
              }
            }
          }

        // chatbot manager: process request such as start and end
        // BOT_MANAGER_REQ_TOPIC = `s/${SP_ID}/a/${APP_ID}/t/+/req/t/${BOT_ID}/#`
        } else if (splitedTopic.length >= 7 && splitedTopic[4] === 't' && splitedTopic[6] === 'req') {
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
          let instanceId = `bot:${roomId}:${sessionId}`; // new chatbot instance per room id

          if (message.method === 'start') {
            if (self.cluster.isLeaderNode()) {
              const targetNode: ClusterSyncNode = self.cluster.getNodeToAssignJob();
              if (targetNode && targetNode.type === 'worker') {
                self.clusterSendForwardCommand(targetNode.id, instanceId, message);
                return;
              }
            } else {
              // Ignore start command
              return;
            }
          }

          self.handleBotCommand(BOT_ID, instanceId, message);

        // chatbot instance: process response
        // BOT_INSTANCE_RES_TOPIC = `s/${SP_ID}/a/${APP_ID}/u/+/r/+/res/t/${BOT_ID}/#`
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
    }

    this.client.once('connect', function (/*options*/) {
      self.emit('ready');
      self.recoverBots();
    });

    // timeout event for older than 10 min bot
    if (this.intervalBotHealthCheckTimer) {
      clearInterval(this.intervalBotHealthCheckTimer);
      this.intervalBotHealthCheckTimer = null;
    }

    this.intervalBotHealthCheckTimer = setInterval(() => {
      let now = _.now();
      _.each(self.botInstances, (bot: Bot) => {
        if (now - bot.mtime > BOT_TIMEOUT) {
          // console.log(`quit Bot (>10min older) bot:${bot.id}`);
          self.emit('timeout', bot.id);
        }
      });
    }, ONE_MIN_IN_MS);
  }

  finalize(cb: Function) {
    if (this.intervalBotHealthCheckTimer) {
      clearInterval(this.intervalBotHealthCheckTimer);
      this.intervalBotHealthCheckTimer = null;
    }

    _.each(this.getAllBots(), (bot: Bot) => {
      // bot.sendCommand('botEnd'); // request to end bot
      bot.finalize();
    });

    this.cluster.removeNode();

    setTimeout(() => {
      this.cluster.finalize();

      if (this.mqttState === 'none') {
        return cb && cb();
      } else {
        this.mqttState = 'none';
        this.client.end(true, () => {
          return cb && cb();
        });
      }
    }, 100);
  }

  addBot(bot: Bot) {
    if (this.botInstances[bot.id]) {
      console.error('already added', bot.id);
      return;
    }
    this.botInstances[bot.id] = bot;
    this.cluster.sendSyncMeta({ lastBotInstanceId: bot.id });
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

  sendMessage(mqttMessage: any, options?: any, cb?: (err: Error) => void) {
    this.mtime = _.now();

    if (_.isFunction(options)) {
      cb = options;
      options = null;
    }

    let topic = this.config.topic.msgPub;
    let message: any = { t: Date.now(), m: mqttMessage, _sid: this.config.context.session };

    if (options) {
      message.o = options;
    }

    if (topic && !_.isNil(message)) {
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

    if (topic && !_.isNil(message)) {
      this.client.publish(topic, JSON.stringify(message), function(err?: Error) {
        return cb && cb(err);
      });
    } else {
      return cb && cb(Error('no message to send'));
    }
  }

  sendCommand(command: 'botEnd'|'transferToAgent'|'transferToBot',
              options?: ((err?: Error) => void)|BotCommandTransferToBotParams, cb?: (err?: Error) => void) {
    this.mtime = _.now();

    let rpcData;
    let context = this.config.context;
    let cmdPubTopic = this.config.topic.cmdPub;
    let cmdResPubTopic = this.config.topic.cmdResPub;

    if (_.isFunction(options)) {
      cb = <(err?: Error) => void>options;
      options = null;
    }

    if (command === 'botEnd') {
      rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'end', {
        _context: context, // every message should include the saved context
        resPub: cmdResPubTopic, // resonse topic for cmdPubTopic
      });
    } else if (command === 'transferToAgent') {
      rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'transfer', {
        type: 'agent', // transfer to target
        _context: context, // every message should include the saved context
        resPub: cmdResPubTopic, // resonse topic for cmdPubTopic
      });
    } else if (command === 'transferToBot') {
      let transferToBotParams: BotCommandTransferToBotParams = <BotCommandTransferToBotParams>options;
      if (transferToBotParams && !_.isNil(transferToBotParams.id)) {
        rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'transfer', {
          type: 'bot', // transfer to target
          _context: context, // every message should include the saved context
          resPub: cmdResPubTopic, // resonse topic for cmdPubTopic
          targetId: transferToBotParams.id
        });
      }
    }

    if (rpcData) {
      // console.log(`[JSONRPC REQUEST] chatbot --> gitple : ${cmdPubTopic}`);
      //console.log(rpcData);
      this.client.publish(cmdPubTopic, JSON.stringify(rpcData), function(err?: Error) {
        return cb && cb(err);
      });
    } else {
      return cb && cb(new Error('invalid params'));
    }
  }

  saveState(cb?: any) {
    let self = this;
    let store = self.botManager.store;

    if (!store) { return cb && cb();; }

    store.add(self.id, {
      config: self.config,
      stime: _.now(),
      state: self.state,
    }, (err: Error) => {
      if (err) {
        console.error('[Bot.saveStore] add error', err);
      } else {
        console.log('[Bot.saveStore] add', self.id);
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
