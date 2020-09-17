export declare type ClusterMessageType = 'sync' | 'syncReq' | 'election';
export declare type ClusterSendCB = (type: ClusterMessageType, data: any, cb?: (err?: Error) => void) => void;
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
    private intervalElectionTimer;
    constructor(nodeId: string, bootTime: number, getJobCount: () => number, send: ClusterSendCB);
    finalize(): void;
    private start();
    private reset(isStopTimer?);
    private syncGetLeader();
    private syncGetWorkers();
    private syncAddInfo(nodeInfo);
    private syncResetLeader();
    private syncRemoveExpired();
    private syncRemoveInfo(nodeId);
    private syncElectionLeader();
    private sendSyncReq();
    private sendLeaderElection(leaderId);
    private sendSync(remove?, meta?);
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
