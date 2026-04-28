import express from 'express';
import {
    createMeeting,
    endMeeting,
    getMeeting,
    joinMeeting,
} from '../controllers/meetingController.js';

const router = express.Router();

router.post('/', createMeeting);
router.get('/:roomName', getMeeting);
router.post('/:roomName/join', joinMeeting);
router.delete('/:roomName', endMeeting);

export default router;
