export declare type ClusterMessageType = 'sync' | 'syncReq' | 'election';
declare type ClusterSendCB = (type: ClusterMessageType, data: any, cb?: (err?: Error) => void) => void;
export interface ClusterElection {
    id: string;
    leaderId: string;
}
export interface ClusterSendSync {
    id: string;
    bootTime: number;
    ttl: number;
    jobCount: number;
    meta?: any;
}
export interface ClusterSyncNode {
    id: string;
    type: 'leader' | 'worker';
    bootTime: number;
    expireTime: number;
    jobCount: number;
}
export declare class Cluster {
    private myNode;
    private sync;
    private election;
    private callback;
    constructor(nodeId: string, bootTime: number, getJobCount: () => number, send: ClusterSendCB);
    private reset;
    private syncGetLeader;
    private syncGetWorkers;
    private syncAddInfo;
    private syncResetLeader;
    private syncRemoveExpired;
    private syncRemoveInfo;
    private syncElectionLeader;
    private sendSyncReq;
    private sendLeaderElection;
    private sendSync;
    sendSyncMeta(meta: any): void;
    removeNode(): void;
    getNodeToAssignJob(): ClusterSyncNode;
    handleMessage(type: ClusterMessageType, data: ClusterSendSync | ClusterElection | null): void;
    getNodeBootTime(): number;
    getNodeId(): string;
    isLeaderNode(): boolean;
    connect(): void;
    disconnect(): void;
}
export {};
