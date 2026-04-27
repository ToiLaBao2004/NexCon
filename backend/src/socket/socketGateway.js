let ioInstance = null;
let getReceiverSocketIdFn = null;

export function configureSocketGateway(io, getReceiverSocketId) {
    ioInstance = io;
    getReceiverSocketIdFn = getReceiverSocketId;
}

export function getSocketGateway() {
    return {
        io: ioInstance,
        getReceiverSocketId: getReceiverSocketIdFn,
    };
}