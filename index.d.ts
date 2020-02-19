import { Cluster } from './cluster';
import events = require('events');
export interface Store {
    add(key: string, obj: Object, cb?: (err: Error) => void): any;
    remove(key: string, cb?: (err: Error) => void): any;
    list(cb: (err: Error, storedList: string[]) => void): any;
}
export declare class JsonFsStore implements Store {
    add(key: string, obj: any, cb?: (err: Error) => void): void;
    remove(key: string, cb?: (err: Error) => void): void;
    list(cb: (err: Error, storedList: string[]) => void): void;
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
        bot: number | string;
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
    id: number | string;
}
export declare class BotManager extends events.EventEmitter {
    config: BotManagerConfig;
    client: any;
    store: Store;
    botInstances: {
        [key: string]: Bot;
    };
    cluster: Cluster;
    clusterSyncPubTopic: string;
    clusterSyncReqPubTopic: string;
    clusterElectionPubTopic: string;
    clusterForwardCommandPubTopic: string;
    constructor(config: BotManagerConfig, store?: Store);
    private handleBotCommand;
    private mqttPublish;
    private clusterGetBotCount;
    private clusterSendData;
    clusterSendForwardCommand(targetNodeId: string, instanceId: string, command: any): void;
    private removeBotState;
    private recoverBots;
    finalize(cb: Function): void;
    addBot(bot: Bot): void;
    removeBot(bot: Bot): void;
    validateBot(botConfig: BotConfig, cb: (err: Error, result: {
        valid: boolean;
    }) => void): void;
    getBot(bot: string | Bot): Bot;
    getAllBots(): any;
}
export declare class Bot extends events.EventEmitter {
    config: BotConfig;
    client: any;
    botManager: BotManager;
    id: string;
    state: any;
    mtime: number;
    ctime: number;
    constructor(botManager: BotManager, botConfig: BotConfig, state?: any);
    finalize(): void;
    sendMessage(mqttMessage: any, options?: any, cb?: (err: Error) => void): void;
    sendKeyInEvent(cb?: (err?: Error) => void): void;
    sendCommand(command: 'botEnd' | 'transferToAgent' | 'transferToBot', options?: ((err?: Error) => void) | BotCommandTransferToBotParams, cb?: (err?: Error) => void): void;
    saveState(cb?: any): void;
    deleteState(): void;
}
