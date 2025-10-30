import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getStreamToken, ensureChatUsers } from "../controllers/chat.controller.js";

const router = express.Router();

router.get("/token", protectRoute, getStreamToken);
router.post("/ensure-users", protectRoute, ensureChatUsers);

export default router;
