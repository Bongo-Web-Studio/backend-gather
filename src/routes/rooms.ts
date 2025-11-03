import { Router } from 'express';
import { createRoom, listRooms, getRoom } from '../controllers/rooms.controller';


const router = Router();
router.post('/', createRoom);
router.get('/', listRooms);
router.get('/:slug', getRoom);


export default router;