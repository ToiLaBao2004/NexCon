let ioInstance = null;
let getReceiverSocketIdFn = null;
let emitToUserFn = null;
let isUserOnlineFn = null;
let joinUserSocketsToRoomFn = null;
let leaveUserSocketsFromRoomFn = null;

export function configureSocketGateway(gateway) {
    ioInstance = gateway.io;
    getReceiverSocketIdFn = gateway.getReceiverSocketId;
    emitToUserFn = gateway.emitToUser;
    isUserOnlineFn = gateway.isUserOnline;
    joinUserSocketsToRoomFn = gateway.joinUserSocketsToRoom;
    leaveUserSocketsFromRoomFn = gateway.leaveUserSocketsFromRoom;
}

export function getSocketGateway() {
    return {
        io: ioInstance,
        getReceiverSocketId: getReceiverSocketIdFn,
        emitToUser: emitToUserFn,
        isUserOnline: isUserOnlineFn,
        joinUserSocketsToRoom: joinUserSocketsToRoomFn,
        leaveUserSocketsFromRoom: leaveUserSocketsFromRoomFn,
    };
}
