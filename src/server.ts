import http from 'http';
import { app } from './app';
import { initSocket } from './ws/socket';


export function createServer() {
const httpServer = http.createServer(app);
initSocket(httpServer); // attaches Socket.IO and mediasoup signaling
return httpServer;
}