import io from 'socket.io-client';

let socket;

const getSocket = () => {
  if (!socket) {
    socket = io(process.env.BACKEND_URL, { withCredentials: true });
  }
  return socket;
};

const setSocket = () => {
  socket = null;
};

export default {
    getSocket,
    setSocket
}